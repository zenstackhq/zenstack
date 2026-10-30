import { sql, type Kysely } from 'kysely';
import { withDb, type TestDb } from './harness';

/**
 * A deep, normalized description of a database's physical schema, used to compare the
 * output of our migration engine against Prisma's byte for byte (modulo cosmetic
 * differences the normalizers below erase). The same introspector runs on both databases,
 * so any representation quirk cancels out as long as it's deterministic.
 */
export interface PhysicalSchema {
    /** Enum type name -> values in order (PostgreSQL only; empty elsewhere). */
    enums: Record<string, string[]>;

    tables: Record<string, PhysicalTable>;
}

export interface PhysicalTable {
    columns: Record<string, PhysicalColumn>;

    /** Primary key columns in order, plus the constraint name where the provider has one. */
    primaryKey: { name?: string; columns: string[] } | null;

    /** Non-primary indexes, sorted by name. */
    indexes: { name: string; columns: string[]; unique: boolean }[];

    /** Foreign keys, sorted by name/columns. */
    foreignKeys: {
        name: string;
        columns: string[];
        refTable: string;
        refColumns: string[];
        onUpdate: string;
        onDelete: string;
    }[];
}

export interface PhysicalColumn {
    /** Normalized physical type text (provider-specific shape, consistent across engines). */
    type: string;

    nullable: boolean;

    /** Normalized default expression text, or null. */
    default: string | null;

    autoIncrement: boolean;
}

/** Tables created by migration tooling, not by the schema. */
const BOOKKEEPING = /^(zenstack_migration|kysely_|_prisma_migrations|sqlite_)/;

export async function introspectPhysicalSchema(db: TestDb): Promise<PhysicalSchema> {
    return withDb(db, (k) => {
        switch (db.provider) {
            case 'sqlite':
                return introspectSqlite(k);
            case 'postgresql':
                return introspectPostgres(k);
            case 'mysql':
                return introspectMysql(k);
        }
    });
}

// #region sqlite

async function introspectSqlite(k: Kysely<any>): Promise<PhysicalSchema> {
    const tables: PhysicalSchema['tables'] = {};
    const masters = (
        await sql<{ name: string; sql: string }>`
            SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name
        `.execute(k)
    ).rows.filter((t) => !BOOKKEEPING.test(t.name));

    for (const { name: table, sql: createSql } of masters) {
        const cols = (
            await sql<{
                name: string;
                type: string;
                notnull: number;
                dflt_value: string | null;
                pk: number;
            }>`PRAGMA table_info(${sql.raw(`"${table}"`)})`.execute(k)
        ).rows;

        const hasAutoIncrement = /\bautoincrement\b/i.test(createSql);
        const columns: PhysicalTable['columns'] = {};
        for (const c of cols) {
            columns[c.name] = {
                type: normalizeSqliteType(c.type),
                nullable: c.notnull === 0 && c.pk === 0,
                default: normalizeDefault(c.dflt_value),
                autoIncrement: hasAutoIncrement && c.pk > 0,
            };
        }
        const pkCols = cols
            .filter((c) => c.pk > 0)
            .sort((a, b) => a.pk - b.pk)
            .map((c) => c.name);

        const indexes: PhysicalTable['indexes'] = [];
        const idxList = (
            await sql<{ name: string; unique: number; origin: string }>`PRAGMA index_list(${sql.raw(
                `"${table}"`,
            )})`.execute(k)
        ).rows;
        for (const idx of idxList) {
            if (idx.origin === 'pk' || idx.name.startsWith('sqlite_autoindex')) {
                continue;
            }
            const idxCols = (await sql<{ name: string }>`PRAGMA index_info(${sql.raw(`"${idx.name}"`)})`.execute(k))
                .rows;
            indexes.push({ name: idx.name, columns: idxCols.map((c) => c.name), unique: idx.unique === 1 });
        }

        const fkRows = (
            await sql<{
                id: number;
                seq: number;
                table: string;
                from: string;
                to: string;
                on_update: string;
                on_delete: string;
            }>`PRAGMA foreign_key_list(${sql.raw(`"${table}"`)})`.execute(k)
        ).rows;
        const fksById = new Map<number, PhysicalTable['foreignKeys'][number]>();
        for (const r of [...fkRows].sort((a, b) => a.id - b.id || a.seq - b.seq)) {
            const fk = fksById.get(r.id) ?? {
                // SQLite doesn't name FK constraints
                name: '',
                columns: [],
                refTable: r.table,
                refColumns: [],
                onUpdate: normalizeAction(r.on_update),
                onDelete: normalizeAction(r.on_delete),
            };
            fk.columns.push(r.from);
            fk.refColumns.push(r.to);
            fksById.set(r.id, fk);
        }

        tables[table] = {
            columns,
            primaryKey: pkCols.length > 0 ? { columns: pkCols } : null,
            indexes: sortIndexes(indexes),
            foreignKeys: sortFks([...fksById.values()]),
        };
    }
    return { enums: {}, tables };
}

/** SQLite types are case-insensitive and whitespace-tolerant; compare lowercased. */
function normalizeSqliteType(type: string): string {
    return type.toLowerCase().replace(/\s+/g, ' ').trim();
}

// #endregion

// #region postgresql

async function introspectPostgres(k: Kysely<any>): Promise<PhysicalSchema> {
    const enums: PhysicalSchema['enums'] = {};
    const enumRows = (
        await sql<{ typname: string; enumlabel: string }>`
            SELECT t.typname, e.enumlabel
            FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
            ORDER BY t.typname, e.enumsortorder
        `.execute(k)
    ).rows;
    for (const r of enumRows) {
        (enums[r.typname] ??= []).push(r.enumlabel);
    }

    const tables: PhysicalSchema['tables'] = {};
    const tableRows = (
        await sql<{ table_name: string }>`
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name
        `.execute(k)
    ).rows.filter((t) => !BOOKKEEPING.test(t.table_name));

    for (const { table_name: table } of tableRows) {
        const cols = (
            await sql<{
                column_name: string;
                udt_name: string;
                character_maximum_length: number | null;
                numeric_precision: number | null;
                numeric_scale: number | null;
                datetime_precision: number | null;
                is_nullable: string;
                column_default: string | null;
            }>`
                SELECT column_name, udt_name, character_maximum_length, numeric_precision,
                       numeric_scale, datetime_precision, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = ${table}
                ORDER BY ordinal_position
            `.execute(k)
        ).rows;
        const columns: PhysicalTable['columns'] = {};
        for (const c of cols) {
            const isSerial = !!c.column_default?.startsWith('nextval(');
            columns[c.column_name] = {
                type: pgTypeText(c),
                nullable: c.is_nullable === 'YES',
                // the serial sequence default is represented via `autoIncrement` (its name
                // embeds the table name, which both engines derive identically anyway)
                default: isSerial ? null : normalizeDefault(c.column_default),
                autoIncrement: isSerial,
            };
        }

        const pk = (
            await sql<{ conname: string; attname: string }>`
                SELECT con.conname, att.attname
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
                WHERE con.contype = 'p' AND rel.relname = ${table}
                ORDER BY u.ord
            `.execute(k)
        ).rows;

        const idxRows = (
            await sql<{ indexname: string; unique: boolean; attname: string; ord: number }>`
                SELECT c.relname AS indexname, ix.indisunique AS unique, att.attname, u.ord
                FROM pg_index ix
                JOIN pg_class c ON c.oid = ix.indexrelid
                JOIN pg_class t ON t.oid = ix.indrelid
                JOIN unnest(ix.indkey) WITH ORDINALITY AS u(attnum, ord) ON true
                JOIN pg_attribute att ON att.attrelid = t.oid AND att.attnum = u.attnum
                WHERE t.relname = ${table} AND NOT ix.indisprimary
                ORDER BY c.relname, u.ord
            `.execute(k)
        ).rows;
        const idxByName = new Map<string, PhysicalTable['indexes'][number]>();
        for (const r of idxRows) {
            const idx = idxByName.get(r.indexname) ?? { name: r.indexname, columns: [], unique: r.unique };
            idx.columns.push(r.attname);
            idxByName.set(r.indexname, idx);
        }

        const fkRows = (
            await sql<{
                conname: string;
                attname: string;
                reftable: string;
                refattname: string;
                confupdtype: string;
                confdeltype: string;
                ord: number;
            }>`
                SELECT con.conname, att.attname, ref.relname AS reftable, refatt.attname AS refattname,
                       con.confupdtype, con.confdeltype, u.ord
                FROM pg_constraint con
                JOIN pg_class rel ON rel.oid = con.conrelid
                JOIN pg_class ref ON ref.oid = con.confrelid
                JOIN unnest(con.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
                JOIN unnest(con.confkey) WITH ORDINALITY AS cu(attnum, ord) ON cu.ord = u.ord
                JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = u.attnum
                JOIN pg_attribute refatt ON refatt.attrelid = con.confrelid AND refatt.attnum = cu.attnum
                WHERE con.contype = 'f' AND rel.relname = ${table}
                ORDER BY con.conname, u.ord
            `.execute(k)
        ).rows;
        const fkByName = new Map<string, PhysicalTable['foreignKeys'][number]>();
        for (const r of fkRows) {
            const fk = fkByName.get(r.conname) ?? {
                name: r.conname,
                columns: [],
                refTable: r.reftable,
                refColumns: [],
                onUpdate: pgAction(r.confupdtype),
                onDelete: pgAction(r.confdeltype),
            };
            fk.columns.push(r.attname);
            fk.refColumns.push(r.refattname);
            fkByName.set(r.conname, fk);
        }

        tables[table] = {
            columns,
            primaryKey: pk.length > 0 ? { name: pk[0]!.conname, columns: pk.map((r) => r.attname) } : null,
            indexes: sortIndexes([...idxByName.values()]),
            foreignKeys: sortFks([...fkByName.values()]),
        };
    }
    return { enums, tables };
}

/** Renders a comparable pg type text from information_schema data. */
function pgTypeText(c: {
    udt_name: string;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    datetime_precision: number | null;
}): string {
    const array = c.udt_name.startsWith('_');
    const base = array ? c.udt_name.slice(1) : c.udt_name;
    let text = base;
    if (c.character_maximum_length !== null) {
        text = `${base}(${c.character_maximum_length})`;
    } else if (base === 'numeric' && c.numeric_precision !== null) {
        text = `${base}(${c.numeric_precision},${c.numeric_scale ?? 0})`;
    } else if (['timestamp', 'timestamptz', 'time', 'timetz'].includes(base) && c.datetime_precision !== null) {
        text = `${base}(${c.datetime_precision})`;
    }
    return array ? `${text}[]` : text;
}

function pgAction(code: string): string {
    switch (code) {
        case 'a':
            return 'NO ACTION';
        case 'r':
            return 'RESTRICT';
        case 'c':
            return 'CASCADE';
        case 'n':
            return 'SET NULL';
        case 'd':
            return 'SET DEFAULT';
        default:
            return code;
    }
}

// #endregion

// #region mysql

async function introspectMysql(k: Kysely<any>): Promise<PhysicalSchema> {
    const tables: PhysicalSchema['tables'] = {};
    const tableRows = (
        await sql<{ TABLE_NAME: string }>`
            SELECT TABLE_NAME FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME
        `.execute(k)
    ).rows.filter((t) => !BOOKKEEPING.test(t.TABLE_NAME));

    for (const { TABLE_NAME: table } of tableRows) {
        const cols = (
            await sql<{
                COLUMN_NAME: string;
                COLUMN_TYPE: string;
                IS_NULLABLE: string;
                COLUMN_DEFAULT: string | null;
                EXTRA: string;
            }>`
                SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
                ORDER BY ORDINAL_POSITION
            `.execute(k)
        ).rows;
        const columns: PhysicalTable['columns'] = {};
        for (const c of cols) {
            columns[c.COLUMN_NAME] = {
                type: c.COLUMN_TYPE.toLowerCase(),
                nullable: c.IS_NULLABLE === 'YES',
                default: normalizeDefault(c.COLUMN_DEFAULT),
                autoIncrement: c.EXTRA.includes('auto_increment'),
            };
        }

        const idxRows = (
            await sql<{ INDEX_NAME: string; NON_UNIQUE: number; COLUMN_NAME: string; SEQ_IN_INDEX: number }>`
                SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table}
                ORDER BY INDEX_NAME, SEQ_IN_INDEX
            `.execute(k)
        ).rows;
        const pkCols = idxRows.filter((r) => r.INDEX_NAME === 'PRIMARY').map((r) => r.COLUMN_NAME);
        const idxByName = new Map<string, PhysicalTable['indexes'][number]>();
        for (const r of idxRows) {
            if (r.INDEX_NAME === 'PRIMARY') {
                continue;
            }
            const idx = idxByName.get(r.INDEX_NAME) ?? {
                name: r.INDEX_NAME,
                columns: [],
                unique: Number(r.NON_UNIQUE) === 0,
            };
            idx.columns.push(r.COLUMN_NAME);
            idxByName.set(r.INDEX_NAME, idx);
        }

        const fkRows = (
            await sql<{
                CONSTRAINT_NAME: string;
                COLUMN_NAME: string;
                REFERENCED_TABLE_NAME: string;
                REFERENCED_COLUMN_NAME: string;
                UPDATE_RULE: string;
                DELETE_RULE: string;
            }>`
                SELECT kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME,
                       kcu.REFERENCED_COLUMN_NAME, rc.UPDATE_RULE, rc.DELETE_RULE
                FROM information_schema.KEY_COLUMN_USAGE kcu
                JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                    ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = ${table}
                    AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
            `.execute(k)
        ).rows;
        const fkByName = new Map<string, PhysicalTable['foreignKeys'][number]>();
        for (const r of fkRows) {
            const fk = fkByName.get(r.CONSTRAINT_NAME) ?? {
                name: r.CONSTRAINT_NAME,
                columns: [],
                refTable: r.REFERENCED_TABLE_NAME,
                refColumns: [],
                onUpdate: normalizeAction(r.UPDATE_RULE),
                onDelete: normalizeAction(r.DELETE_RULE),
            };
            fk.columns.push(r.COLUMN_NAME);
            fk.refColumns.push(r.REFERENCED_COLUMN_NAME);
            fkByName.set(r.CONSTRAINT_NAME, fk);
        }

        tables[table] = {
            columns,
            // MySQL's PK constraint is anonymous
            primaryKey: pkCols.length > 0 ? { columns: pkCols } : null,
            indexes: sortIndexes([...idxByName.values()]),
            foreignKeys: sortFks([...fkByName.values()]),
        };
    }
    return { enums: {}, tables };
}

// #endregion

// #region shared normalization

/** Uppercases keyword-ish defaults (CURRENT_TIMESTAMP et al) so case differences cancel out. */
function normalizeDefault(value: string | null): string | null {
    if (value === null) {
        return null;
    }
    const trimmed = value.trim();
    if (/^current_timestamp(\(\d*\))?$/i.test(trimmed)) {
        return trimmed.toUpperCase();
    }
    return trimmed;
}

function normalizeAction(action: string): string {
    return action.toUpperCase();
}

function sortIndexes<T extends { name: string }>(indexes: T[]): T[] {
    return [...indexes].sort((a, b) => a.name.localeCompare(b.name));
}

function sortFks<T extends { name: string; columns: string[] }>(fks: T[]): T[] {
    return [...fks].sort((a, b) => a.name.localeCompare(b.name) || a.columns.join().localeCompare(b.columns.join()));
}

// #endregion
