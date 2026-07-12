import type { DataSourceProviderType } from '@zenstackhq/schema';
import { sql, type ColumnDefinitionBuilder, type CreateTableBuilder, type Kysely } from 'kysely';
import { sqlTypeText } from './codegen';
import { primaryKeyName } from './conventions';
import type { ColumnCopy, SchemaChange } from './diff';
import type { ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, Snapshot, TableSnapshot } from './types';

type Provider = DataSourceProviderType;

/**
 * Executes a list of {@link SchemaChange}s directly against a Kysely instance using its
 * schema builder. This is the runtime counterpart to the text codegen used for migration
 * files — it is used by `db push` to reconcile a live database to the desired schema.
 *
 * `snapshot` is the desired schema (provides column type/constraint details for creates
 * and additions). Unsupported changes are skipped.
 */
export async function applyChanges(
    db: Kysely<any>,
    changes: SchemaChange[],
    snapshot: Snapshot,
    provider: Provider,
): Promise<void> {
    for (const change of changes) {
        switch (change.kind) {
            case 'create-enum':
                if (provider === 'postgresql') {
                    await db.schema
                        .createType(change.enum.name)
                        .asEnum(change.enum.values)
                        .execute();
                }
                break;
            case 'drop-enum':
                if (provider === 'postgresql') {
                    await db.schema.dropType(change.enum.name).ifExists().execute();
                }
                break;
            case 'alter-enum-add-values':
                if (provider === 'postgresql') {
                    for (const value of change.added) {
                        await sql
                            .raw(`ALTER TYPE "${change.enum.name}" ADD VALUE IF NOT EXISTS '${value.replace(/'/g, "''")}'`)
                            .execute(db);
                    }
                }
                break;
            case 'create-table':
                await createTable(db, change.table, snapshot, provider);
                for (const index of change.table.indexes) {
                    await createIndex(db, change.table.name, index);
                }
                break;
            case 'drop-table':
                await db.schema.dropTable(change.table.name).ifExists().execute();
                break;
            case 'rename-table':
                await db.schema.alterTable(change.from).renameTo(change.to.name).execute();
                break;
            case 'add-column':
                await addColumn(db, change.table.name, change.column, snapshot, provider, change.fk);
                break;
            case 'drop-column':
                await db.schema.alterTable(change.table.name).dropColumn(change.column.name).execute();
                break;
            case 'rename-column':
                await db.schema.alterTable(change.table.name).renameColumn(change.from, change.column.name).execute();
                break;
            case 'alter-column':
                await alterColumn(db, change.table.name, change.from, change.to, snapshot, provider);
                break;
            case 'create-index':
                await createIndex(db, change.table.name, change.index);
                break;
            case 'drop-index':
                if (provider === 'mysql') {
                    // MySQL requires the table and has no IF EXISTS for DROP INDEX
                    await db.schema.dropIndex(change.index.name).on(change.table.name).execute();
                } else {
                    await db.schema.dropIndex(change.index.name).ifExists().execute();
                }
                break;
            case 'add-foreign-key':
                await addForeignKey(db, change.table.name, change.fk);
                break;
            case 'drop-foreign-key':
                await db.schema.alterTable(change.table.name).dropConstraint(change.fk.name).execute();
                break;
            case 'drop-primary-key':
                if (provider === 'mysql') {
                    await sql.raw(`ALTER TABLE \`${change.table.name}\` DROP PRIMARY KEY`).execute(db);
                } else {
                    await db.schema
                        .alterTable(change.table.name)
                        .dropConstraint(primaryKeyName(provider, change.table.name))
                        .execute();
                }
                break;
            case 'add-primary-key':
                await db.schema
                    .alterTable(change.table.name)
                    .addPrimaryKeyConstraint(primaryKeyName(provider, change.table.name), change.columns)
                    .execute();
                break;
            case 'rebuild-table':
                await rebuildTable(db, change.table, change.copyColumns, snapshot, provider);
                break;
            case 'unsupported':
                // cannot be applied automatically; skip
                break;
        }
    }
}

async function createTable(db: Kysely<any>, table: TableSnapshot, snapshot: Snapshot, provider: Provider) {
    let builder: CreateTableBuilder<string, any> = db.schema.createTable(table.name);

    for (const column of Object.values(table.columns)) {
        builder = builder.addColumn(column.name, columnType(provider, column, snapshot), (col) =>
            applyColumnModifiers(col, column, provider),
        );
    }

    if (table.primaryKey.length > 0) {
        builder = builder.addPrimaryKeyConstraint(primaryKeyName(provider, table.name), table.primaryKey as string[]);
    }
    for (const fk of table.foreignKeys) {
        builder = builder.addForeignKeyConstraint(
            fk.name,
            fk.columns as string[],
            fk.refTable,
            fk.refColumns as string[],
            (cb) => {
                let out = cb;
                if (fk.onDelete) {
                    out = out.onDelete(mapCascade(fk.onDelete));
                }
                if (fk.onUpdate) {
                    out = out.onUpdate(mapCascade(fk.onUpdate));
                }
                return out;
            },
        );
    }

    await builder.execute();
}

async function addColumn(
    db: Kysely<any>,
    tableName: string,
    column: ColumnSnapshot,
    snapshot: Snapshot,
    provider: Provider,
    fk?: ForeignKeySnapshot,
) {
    await db.schema
        .alterTable(tableName)
        .addColumn(column.name, columnType(provider, column, snapshot), (col) => {
            let out = applyColumnModifiers(col, column, provider);
            if (fk && fk.refColumns.length === 1) {
                out = out.references(`${fk.refTable}.${fk.refColumns[0]}`);
                if (fk.onDelete) {
                    out = out.onDelete(mapCascade(fk.onDelete));
                }
                if (fk.onUpdate) {
                    out = out.onUpdate(mapCascade(fk.onUpdate));
                }
            }
            return out;
        })
        .execute();
}

/** SQLite table rebuild (create temp -> copy -> swap) used to alter/drop columns. */
async function rebuildTable(
    db: Kysely<any>,
    table: TableSnapshot,
    copyColumns: ColumnCopy[],
    snapshot: Snapshot,
    provider: Provider,
) {
    const temp = `_zenstack_new_${table.name}`;
    const targets = copyColumns.map((c) => `"${c.target}"`).join(', ');
    const sources = copyColumns.map((c) => `"${c.source}"`).join(', ');
    await sql`PRAGMA foreign_keys = OFF`.execute(db);
    await createTable(db, { ...table, name: temp }, snapshot, provider);
    if (copyColumns.length > 0) {
        await sql.raw(`INSERT INTO "${temp}" (${targets}) SELECT ${sources} FROM "${table.name}"`).execute(db);
    }
    await db.schema.dropTable(table.name).execute();
    await sql.raw(`ALTER TABLE "${temp}" RENAME TO "${table.name}"`).execute(db);
    for (const index of table.indexes) {
        await createIndex(db, table.name, index);
    }
    await sql`PRAGMA foreign_keys = ON`.execute(db);
}

/** Adds a foreign-key constraint to an existing table. */
async function addForeignKey(db: Kysely<any>, tableName: string, fk: ForeignKeySnapshot) {
    await db.schema
        .alterTable(tableName)
        .addForeignKeyConstraint(fk.name, fk.columns as string[], fk.refTable, fk.refColumns as string[], (cb) => {
            let out = cb;
            if (fk.onDelete) {
                out = out.onDelete(mapCascade(fk.onDelete));
            }
            if (fk.onUpdate) {
                out = out.onUpdate(mapCascade(fk.onUpdate));
            }
            return out;
        })
        .execute();
}

/** Applies an in-place column change (type / nullability / default) on PostgreSQL/MySQL. */
async function alterColumn(
    db: Kysely<any>,
    tableName: string,
    from: ColumnSnapshot,
    to: ColumnSnapshot,
    snapshot: Snapshot,
    provider: Provider,
) {
    // MySQL has no granular ALTER COLUMN — redefine the whole column with MODIFY COLUMN
    if (provider === 'mysql') {
        await db.schema
            .alterTable(tableName)
            .modifyColumn(to.name, columnType(provider, to, snapshot), (col) => {
                let out = col;
                if (to.autoIncrement) {
                    out = out.autoIncrement();
                }
                const value = defaultValue(to, provider);
                if (value !== undefined) {
                    out = out.defaultTo(value);
                }
                if (!to.nullable) {
                    out = out.notNull();
                }
                return out;
            })
            .execute();
        return;
    }

    if (sqlTypeText(provider, from, snapshot) !== sqlTypeText(provider, to, snapshot)) {
        await db.schema
            .alterTable(tableName)
            .alterColumn(to.name, (col) => col.setDataType(columnType(provider, to, snapshot)))
            .execute();
    }
    if (from.nullable !== to.nullable) {
        await db.schema
            .alterTable(tableName)
            .alterColumn(to.name, (col) => (to.nullable ? col.dropNotNull() : col.setNotNull()))
            .execute();
    }
    if (JSON.stringify(from.default) !== JSON.stringify(to.default)) {
        const value = defaultValue(to, provider);
        if (value !== undefined) {
            await db.schema
                .alterTable(tableName)
                .alterColumn(to.name, (col) => col.setDefault(value))
                .execute();
        } else if (from.default) {
            await db.schema
                .alterTable(tableName)
                .alterColumn(to.name, (col) => col.dropDefault())
                .execute();
        }
    }
}

async function createIndex(db: Kysely<any>, tableName: string, index: IndexSnapshot) {
    let builder = db.schema.createIndex(index.name).on(tableName).columns(index.columns as string[]);
    if (index.unique) {
        builder = builder.unique();
    }
    await builder.execute();
}

function columnType(provider: Provider, column: ColumnSnapshot, snapshot: Snapshot) {
    // `sql.raw` accepts any provider-specific type text (e.g. `varchar(255)`, `jsonb`, `text[]`)
    return sql.raw(sqlTypeText(provider, column, snapshot));
}

function applyColumnModifiers(
    col: ColumnDefinitionBuilder,
    column: ColumnSnapshot,
    provider: Provider,
): ColumnDefinitionBuilder {
    let out = col;
    if (column.primaryKey) {
        out = out.primaryKey();
    }
    if (column.autoIncrement && provider !== 'postgresql') {
        // postgres uses the `serial` type instead of an autoIncrement modifier
        out = out.autoIncrement();
    }
    const defaultTo = defaultValue(column, provider);
    if (defaultTo !== undefined) {
        out = out.defaultTo(defaultTo);
    }
    // `@unique` is represented as a (unique) index, not a column modifier
    if (!column.nullable) {
        out = out.notNull();
    }
    return out;
}

function defaultValue(column: ColumnSnapshot, provider: Provider) {
    const def = column.default;
    if (!def) {
        return undefined;
    }
    switch (def.kind) {
        case 'literal':
            return def.value;
        case 'now':
            return provider === 'mysql' ? sql`CURRENT_TIMESTAMP(3)` : sql`CURRENT_TIMESTAMP`;
        case 'autoincrement':
        case 'call':
            // handled via the serial type / autoIncrement modifier, or not supported automatically
            return undefined;
    }
}

function mapCascade(action: 'SetNull' | 'Cascade' | 'Restrict' | 'NoAction' | 'SetDefault') {
    switch (action) {
        case 'SetNull':
            return 'set null' as const;
        case 'Cascade':
            return 'cascade' as const;
        case 'Restrict':
            return 'restrict' as const;
        case 'NoAction':
            return 'no action' as const;
        case 'SetDefault':
            return 'set default' as const;
    }
}
