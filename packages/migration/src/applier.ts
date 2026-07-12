import type { DataSourceProviderType } from '@zenstackhq/schema';
import { sql, type ColumnDefinitionBuilder, type CreateTableBuilder, type Kysely } from 'kysely';
import { sqlTypeText } from './codegen';
import { primaryKeyName } from './conventions';
import type { SchemaChange } from './diff';
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
            case 'create-index':
                await createIndex(db, change.table.name, change.index);
                break;
            case 'drop-index':
                await db.schema.dropIndex(change.index.name).ifExists().execute();
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

/** SQLite table rebuild used to drop foreign-key columns (create temp -> copy -> swap). */
async function rebuildTable(
    db: Kysely<any>,
    table: TableSnapshot,
    copyColumns: string[],
    snapshot: Snapshot,
    provider: Provider,
) {
    const temp = `_zenstack_new_${table.name}`;
    const cols = copyColumns.map((c) => `"${c}"`).join(', ');
    await sql`PRAGMA foreign_keys = OFF`.execute(db);
    await createTable(db, { ...table, name: temp }, snapshot, provider);
    await sql.raw(`INSERT INTO "${temp}" (${cols}) SELECT ${cols} FROM "${table.name}"`).execute(db);
    await db.schema.dropTable(table.name).execute();
    await sql.raw(`ALTER TABLE "${temp}" RENAME TO "${table.name}"`).execute(db);
    for (const index of table.indexes) {
        await createIndex(db, table.name, index);
    }
    await sql`PRAGMA foreign_keys = ON`.execute(db);
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
