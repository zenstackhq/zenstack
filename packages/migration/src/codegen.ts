import type { CascadeAction, DataSourceProviderType } from '@zenstackhq/schema';
import { primaryKeyName } from './conventions';
import type { ColumnCopy, EnumColumnUsage, SchemaChange } from './diff';
import type { ColumnSnapshot, EnumSnapshot, IndexSnapshot, NativeTypeSnapshot, Snapshot, TableSnapshot } from './types';

type Provider = DataSourceProviderType;

// #region SQL type mapping (mirrors SchemaDbPusher in @zenstackhq/orm)

/** Kysely `ColumnDataType` literals that are safe to emit as a plain quoted string. */
const SIMPLE_TYPES = new Set([
    'text',
    'integer',
    'boolean',
    'bigint',
    'real',
    'decimal',
    'timestamp',
    'json',
    'jsonb',
    'blob',
    'serial',
]);

/** Raw SQL text of the physical column type for a given provider. */
export function sqlTypeText(provider: Provider, column: ColumnSnapshot, snapshot: Snapshot): string {
    let base: string;
    if (column.isEnum) {
        base = enumTypeText(provider, snapshot.enums[column.type]);
    } else if (provider === 'postgresql' && column.autoIncrement) {
        base = pgSerialType(column);
    } else if (column.nativeType && provider !== 'sqlite') {
        // an explicit `@db.*` native type overrides the default mapping.
        // SQLite is dynamically typed, so native types don't apply there.
        base = renderNativeType(column.nativeType);
    } else if (column.isJson) {
        base = jsonType(provider);
    } else {
        base = builtinTypeText(provider, column.type);
    }
    return column.array ? `${base}[]` : base;
}

/** PostgreSQL auto-increment pseudo-types, honoring a native small/big int type. */
function pgSerialType(column: ColumnSnapshot): string {
    const nativeName = column.nativeType?.name;
    if (nativeName === 'SmallInt') {
        return 'smallserial';
    }
    if (nativeName === 'BigInt' || column.type === 'BigInt') {
        return 'bigserial';
    }
    return 'serial';
}

/**
 * Renders a Prisma-style native type to its concrete SQL type text. Most names map by
 * lower-casing and appending arguments (`VarChar(200)` -> `varchar(200)`); a handful need
 * special handling.
 */
function renderNativeType(nativeType: NativeTypeSnapshot): string {
    const special = NATIVE_TYPE_SPECIAL[nativeType.name];
    if (special) {
        return special(nativeType.args);
    }
    const args = nativeType.args.length > 0 ? `(${nativeType.args.join(', ')})` : '';
    return nativeType.name.toLowerCase() + args;
}

/** Native types whose SQL text is not simply `lowercase(name)(args)`. */
const NATIVE_TYPE_SPECIAL: Record<string, (args: Array<string | number>) => string> = {
    DoublePrecision: () => 'double precision',
    UnsignedInt: () => 'int unsigned',
    UnsignedSmallInt: () => 'smallint unsigned',
    UnsignedMediumInt: () => 'mediumint unsigned',
    UnsignedBigInt: () => 'bigint unsigned',
    UnsignedTinyInt: (args) => `tinyint${args.length > 0 ? `(${args.join(', ')})` : ''} unsigned`,
};

/** Emits the column type as a TypeScript expression (a quoted string or a ``sql`...` `` call). */
function emitColumnType(provider: Provider, column: ColumnSnapshot, snapshot: Snapshot): string {
    const text = sqlTypeText(provider, column, snapshot);
    if (SIMPLE_TYPES.has(text)) {
        return `'${text}'`;
    }
    return `sql\`${text}\``;
}

// Default SQL type text per scalar and provider, matching Prisma's defaults (verified
// against Prisma v7). Case is irrelevant physically (catalogs normalize / SQLite is
// affinity-based), so lowercase is used throughout.
function builtinTypeText(provider: Provider, type: string): string {
    switch (type) {
        case 'String':
            return provider === 'mysql' ? 'varchar(191)' : 'text';
        case 'Boolean':
            // Prisma emits BOOLEAN; MySQL stores it as tinyint(1)
            return provider === 'mysql' ? 'tinyint(1)' : 'boolean';
        case 'Int':
            return 'integer';
        case 'Float':
            return provider === 'postgresql' ? 'double precision' : provider === 'mysql' ? 'double' : 'real';
        case 'BigInt':
            return 'bigint';
        case 'Decimal':
            return provider === 'postgresql' ? 'decimal(65,30)' : provider === 'mysql' ? 'decimal(65, 30)' : 'decimal';
        case 'DateTime':
            return provider === 'postgresql' ? 'timestamp(3)' : provider === 'mysql' ? 'datetime(3)' : 'datetime';
        case 'Bytes':
            return provider === 'postgresql' ? 'bytea' : provider === 'mysql' ? 'longblob' : 'blob';
        case 'Json':
            return jsonType(provider);
        default:
            // fall back to text for unknown/unsupported types
            return 'text';
    }
}

function jsonType(provider: Provider): string {
    return provider === 'mysql' ? 'json' : 'jsonb';
}

function enumTypeText(provider: Provider, enumDef: EnumSnapshot | undefined): string {
    if (provider === 'postgresql' && enumDef) {
        return `"${enumDef.name}"`;
    }
    if (provider === 'mysql' && enumDef) {
        return `enum(${enumDef.values.map((v) => `'${v}'`).join(', ')})`;
    }
    return 'text';
}

// #endregion

// #region migrate() body generation

/** Generates the body (statements) of the `migrate` function for the given changes. */
export function generateMigrateBody(changes: SchemaChange[], provider: Provider, snapshot: Snapshot): string {
    const statements: string[] = [];
    for (const change of changes) {
        switch (change.kind) {
            case 'create-enum':
                statements.push(emitCreateEnum(provider, change.enum));
                break;
            case 'drop-enum':
                statements.push(emitDropEnum(provider, change.enum));
                break;
            case 'alter-enum-add-values':
                for (const value of change.added) {
                    statements.push(
                        `    await sql\`ALTER TYPE "${change.enum.name}" ADD VALUE IF NOT EXISTS '${sqlLiteral(value)}'\`.execute(db);`,
                    );
                }
                break;
            case 'recreate-enum':
                statements.push(emitRecreateEnum(provider, change.enum, change.columns));
                break;
            case 'create-table':
                statements.push(emitCreateTable(provider, change.table, snapshot));
                for (const index of change.table.indexes) {
                    statements.push(emitCreateIndex(change.table.name, index));
                }
                break;
            case 'drop-table':
                statements.push(`    await db.schema.dropTable('${change.table.name}').execute();`);
                break;
            case 'rename-table':
                statements.push(
                    `    await db.schema.alterTable('${change.from}').renameTo('${change.to.name}').execute();`,
                );
                break;
            case 'add-column':
                statements.push(emitAddColumn(provider, change.table, change.column, snapshot, change.fk));
                break;
            case 'drop-column':
                statements.push(
                    `    await db.schema.alterTable('${change.table.name}').dropColumn('${change.column.name}').execute();`,
                );
                break;
            case 'rename-column':
                statements.push(
                    `    await db.schema.alterTable('${change.table.name}').renameColumn('${change.from}', '${change.column.name}').execute();`,
                );
                break;
            case 'alter-column':
                statements.push(emitAlterColumn(provider, change.table, change.from, change.to, snapshot));
                break;
            case 'create-index':
                statements.push(emitCreateIndex(change.table.name, change.index));
                break;
            case 'drop-index':
                // MySQL requires the table: DROP INDEX name ON table
                statements.push(
                    provider === 'mysql'
                        ? `    await db.schema.dropIndex('${change.index.name}').on('${change.table.name}').execute();`
                        : `    await db.schema.dropIndex('${change.index.name}').execute();`,
                );
                break;
            case 'add-foreign-key':
                statements.push(emitAddForeignKey(change.table.name, change.fk));
                break;
            case 'drop-foreign-key':
                statements.push(
                    `    await db.schema.alterTable('${change.table.name}').dropConstraint('${change.fk.name}').execute();`,
                );
                break;
            case 'drop-primary-key':
                // MySQL's primary key is always named PRIMARY — drop it with DROP PRIMARY KEY
                statements.push(
                    provider === 'mysql'
                        ? `    await sql.raw('ALTER TABLE \`${change.table.name}\` DROP PRIMARY KEY').execute(db);`
                        : `    await db.schema.alterTable('${change.table.name}').dropConstraint('${primaryKeyName(provider, change.table.name)}').execute();`,
                );
                break;
            case 'add-primary-key': {
                const cols = change.columns.map((c) => `'${c}'`).join(', ');
                statements.push(
                    `    await db.schema.alterTable('${change.table.name}').addPrimaryKeyConstraint('${primaryKeyName(provider, change.table.name)}', [${cols}]).execute();`,
                );
                break;
            }
            case 'rebuild-table':
                statements.push(emitRebuildTable(provider, change.table, change.copyColumns, snapshot));
                break;
            case 'unsupported':
                statements.push(
                    `    // TODO: unsupported automatic change — please author this manually:\n    //   ${change.description}`,
                );
                break;
        }
    }
    return statements.join('\n\n');
}

function emitCreateEnum(provider: Provider, enumDef: EnumSnapshot): string {
    if (provider !== 'postgresql') {
        return `    // enum "${enumDef.name}" is represented inline for the "${provider}" provider`;
    }
    const values = enumDef.values.map((v) => `'${v}'`).join(', ');
    return `    await db.schema.createType('${enumDef.name}').asEnum([${values}]).execute();`;
}

function emitDropEnum(provider: Provider, enumDef: EnumSnapshot): string {
    if (provider !== 'postgresql') {
        return `    // enum "${enumDef.name}" needs no drop for the "${provider}" provider`;
    }
    return `    await db.schema.dropType('${enumDef.name}').execute();`;
}

/**
 * Recreates a PostgreSQL enum whose values were removed or reordered (pg can't drop enum
 * values in place): create a `<name>_new` type, cast every using column over
 * (`USING col::text::new`), then swap the names and drop the old type. Column defaults must
 * be dropped before the cast; they are restored afterwards when their value still exists in
 * the new enum. The cast fails at apply time if a removed value is still present in the data.
 */
function emitRecreateEnum(provider: Provider, enumDef: EnumSnapshot, columns: EnumColumnUsage[]): string {
    if (provider !== 'postgresql') {
        return `    // enum "${enumDef.name}" is represented inline for the "${provider}" provider`;
    }
    const newName = `${enumDef.name}_new`;
    const oldName = `${enumDef.name}_old`;
    const values = enumDef.values.map((v) => `'${sqlLiteral(v)}'`).join(', ');
    const lines = [`    await db.schema.createType('${newName}').asEnum([${values}]).execute();`];
    for (const { table, column } of columns) {
        if (column.default) {
            lines.push(
                `    await db.schema.alterTable('${table}').alterColumn('${column.name}', (col) => col.dropDefault()).execute();`,
            );
        }
        const array = column.array ? '[]' : '';
        lines.push(
            `    await sql\`ALTER TABLE "${table}" ALTER COLUMN "${column.name}" TYPE "${newName}"${array} USING ("${column.name}"::text${array}::"${newName}"${array})\`.execute(db);`,
        );
    }
    lines.push(`    await sql\`ALTER TYPE "${enumDef.name}" RENAME TO "${oldName}"\`.execute(db);`);
    lines.push(`    await sql\`ALTER TYPE "${newName}" RENAME TO "${enumDef.name}"\`.execute(db);`);
    lines.push(`    await db.schema.dropType('${oldName}').execute();`);
    for (const { table, column } of columns) {
        const value = restorableEnumDefault(column, enumDef);
        if (value !== undefined) {
            lines.push(
                `    await db.schema.alterTable('${table}').alterColumn('${column.name}', (col) => col.setDefault('${sqlLiteral(value)}')).execute();`,
            );
        }
    }
    return lines.join('\n');
}

/** The literal default to restore after an enum recreate, when its value survived the change. */
export function restorableEnumDefault(column: ColumnSnapshot, enumDef: EnumSnapshot): string | undefined {
    const def = column.default;
    return def?.kind === 'literal' && typeof def.value === 'string' && enumDef.values.includes(def.value)
        ? def.value
        : undefined;
}

function emitCreateTable(provider: Provider, table: TableSnapshot, snapshot: Snapshot, nameOverride?: string): string {
    const lines: string[] = [`    await db.schema.createTable('${nameOverride ?? table.name}')`];

    for (const column of Object.values(table.columns)) {
        lines.push(emitColumnDefinition(provider, column, snapshot));
    }

    if (table.primaryKey.length > 0) {
        const cols = table.primaryKey.map((c) => `'${c}'`).join(', ');
        lines.push(`        .addPrimaryKeyConstraint('${primaryKeyName(provider, table.name)}', [${cols}])`);
    }

    for (const fk of table.foreignKeys) {
        lines.push(emitForeignKey(fk));
    }

    lines.push('        .execute();');
    return lines.join('\n');
}

function emitCreateIndex(tableName: string, index: IndexSnapshot): string {
    const cols = index.columns.map((c) => `'${c}'`).join(', ');
    const unique = index.unique ? '.unique()' : '';
    return `    await db.schema.createIndex('${index.name}')${unique}.on('${tableName}').columns([${cols}]).execute();`;
}

/** Emits the SQLite table-rebuild sequence (create temp → copy → swap) used to alter/drop columns. */
function emitRebuildTable(provider: Provider, table: TableSnapshot, copyColumns: ColumnCopy[], snapshot: Snapshot): string {
    const temp = `_zenstack_new_${table.name}`;
    const targets = copyColumns.map((c) => `"${c.target}"`).join(', ');
    const sources = copyColumns.map((c) => `"${c.source}"`).join(', ');
    const lines = [
        '    await sql`PRAGMA foreign_keys = OFF`.execute(db);',
        emitCreateTable(provider, table, snapshot, temp),
        ...(copyColumns.length > 0
            ? [`    await sql\`INSERT INTO "${temp}" (${targets}) SELECT ${sources} FROM "${table.name}"\`.execute(db);`]
            : []),
        `    await db.schema.dropTable('${table.name}').execute();`,
        `    await sql\`ALTER TABLE "${temp}" RENAME TO "${table.name}"\`.execute(db);`,
        ...table.indexes.map((index) => emitCreateIndex(table.name, index)),
        '    await sql`PRAGMA foreign_keys = ON`.execute(db);',
    ];
    return lines.join('\n\n');
}

function emitColumnDefinition(provider: Provider, column: ColumnSnapshot, snapshot: Snapshot): string {
    const type = emitColumnType(provider, column, snapshot);
    const modifiers = columnModifiers(provider, column);
    if (modifiers.length === 0) {
        return `        .addColumn('${column.name}', ${type})`;
    }
    return `        .addColumn('${column.name}', ${type}, (col) => col${modifiers.join('')})`;
}

function columnModifiers(provider: Provider, column: ColumnSnapshot): string[] {
    const mods: string[] = [];
    if (column.primaryKey) {
        mods.push('.primaryKey()');
    }
    if (column.autoIncrement && provider !== 'postgresql') {
        // postgres uses the `serial` type instead of an autoIncrement modifier
        mods.push('.autoIncrement()');
    }
    const defaultValue = emitDefaultValue(provider, column);
    if (defaultValue !== undefined) {
        mods.push(`.defaultTo(${defaultValue})`);
    }
    // `@unique` is represented as a (unique) index, not a column modifier
    if (!column.nullable) {
        mods.push('.notNull()');
    }
    return mods;
}

/** The default value as a TS expression (for `.defaultTo(...)` / `.setDefault(...)`), or undefined. */
function emitDefaultValue(provider: Provider, column: ColumnSnapshot): string | undefined {
    const def = column.default;
    if (!def) {
        return undefined;
    }
    switch (def.kind) {
        case 'literal':
            return typeof def.value === 'string' ? `'${sqlLiteral(def.value)}'` : `${def.value}`;
        case 'now':
            return provider === 'mysql' ? 'sql`CURRENT_TIMESTAMP(3)`' : 'sql`CURRENT_TIMESTAMP`';
        case 'autoincrement':
            // handled via the serial type / autoIncrement modifier
            return undefined;
        case 'call':
            // other generator functions are not yet supported automatically
            return undefined;
    }
}

/** Emits the statements for an in-place column change (type / nullability / default). */
function emitAlterColumn(
    provider: Provider,
    table: TableSnapshot,
    from: ColumnSnapshot,
    to: ColumnSnapshot,
    snapshot: Snapshot,
): string {
    // MySQL has no granular ALTER COLUMN — redefine the whole column with MODIFY COLUMN
    if (provider === 'mysql') {
        const type = emitColumnType(provider, to, snapshot);
        const mods: string[] = [];
        if (to.autoIncrement) {
            mods.push('.autoIncrement()'); // must be restated or the column loses it
        }
        const value = emitDefaultValue(provider, to);
        if (value !== undefined) {
            mods.push(`.defaultTo(${value})`);
        }
        if (!to.nullable) {
            mods.push('.notNull()');
        }
        const cb = mods.length > 0 ? `, (col) => col${mods.join('')}` : '';
        return `    await db.schema.alterTable('${table.name}').modifyColumn('${to.name}', ${type}${cb}).execute();`;
    }

    const stmts: string[] = [];
    const alter = (op: string) => `    await db.schema.alterTable('${table.name}').alterColumn('${to.name}', (col) => ${op}).execute();`;

    if (sqlTypeText(provider, from, snapshot) !== sqlTypeText(provider, to, snapshot)) {
        stmts.push(alter(`col.setDataType(${emitColumnType(provider, to, snapshot)})`));
    }
    if (from.nullable !== to.nullable) {
        stmts.push(alter(to.nullable ? 'col.dropNotNull()' : 'col.setNotNull()'));
    }
    if (JSON.stringify(from.default) !== JSON.stringify(to.default)) {
        const value = emitDefaultValue(provider, to);
        if (value !== undefined) {
            stmts.push(alter(`col.setDefault(${value})`));
        } else if (from.default) {
            stmts.push(alter('col.dropDefault()'));
        }
    }
    return stmts.join('\n\n');
}

/** Escapes a string for embedding in a single-quoted SQL/TS literal. */
function sqlLiteral(value: string): string {
    return value.replace(/'/g, "\\'");
}

function emitForeignKey(fk: { name: string; columns: string[]; refTable: string; refColumns: string[]; onDelete?: CascadeAction; onUpdate?: CascadeAction }): string {
    const cols = fk.columns.map((c) => `'${c}'`).join(', ');
    const refCols = fk.refColumns.map((c) => `'${c}'`).join(', ');
    const actions: string[] = [];
    if (fk.onDelete) {
        actions.push(`.onDelete('${mapCascade(fk.onDelete)}')`);
    }
    if (fk.onUpdate) {
        actions.push(`.onUpdate('${mapCascade(fk.onUpdate)}')`);
    }
    const cb = actions.length > 0 ? `, (cb) => cb${actions.join('')}` : '';
    return `        .addForeignKeyConstraint('${fk.name}', [${cols}], '${fk.refTable}', [${refCols}]${cb})`;
}

/** Emits an `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY …` statement. */
function emitAddForeignKey(
    tableName: string,
    fk: { name: string; columns: string[]; refTable: string; refColumns: string[]; onDelete?: CascadeAction; onUpdate?: CascadeAction },
): string {
    const cols = fk.columns.map((c) => `'${c}'`).join(', ');
    const refCols = fk.refColumns.map((c) => `'${c}'`).join(', ');
    const actions: string[] = [];
    if (fk.onDelete) {
        actions.push(`.onDelete('${mapCascade(fk.onDelete)}')`);
    }
    if (fk.onUpdate) {
        actions.push(`.onUpdate('${mapCascade(fk.onUpdate)}')`);
    }
    const cb = actions.length > 0 ? `, (cb) => cb${actions.join('')}` : '';
    return `    await db.schema.alterTable('${tableName}').addForeignKeyConstraint('${fk.name}', [${cols}], '${fk.refTable}', [${refCols}]${cb}).execute();`;
}

function emitAddColumn(
    provider: Provider,
    table: TableSnapshot,
    column: ColumnSnapshot,
    snapshot: Snapshot,
    fk?: { refTable: string; refColumns: string[]; onDelete?: CascadeAction; onUpdate?: CascadeAction },
): string {
    const type = emitColumnType(provider, column, snapshot);
    let modifiers = columnModifiers(provider, column).join('');
    if (fk && fk.refColumns.length === 1) {
        // add the foreign key inline (works on both SQLite and Postgres)
        modifiers += `.references('${fk.refTable}.${fk.refColumns[0]}')`;
        if (fk.onDelete) {
            modifiers += `.onDelete('${mapCascade(fk.onDelete)}')`;
        }
        if (fk.onUpdate) {
            modifiers += `.onUpdate('${mapCascade(fk.onUpdate)}')`;
        }
    }
    const colArg = modifiers.length === 0 ? `'${column.name}', ${type}` : `'${column.name}', ${type}, (col) => col${modifiers}`;
    return `    await db.schema.alterTable('${table.name}').addColumn(${colArg}).execute();`;
}

function mapCascade(action: CascadeAction): string {
    switch (action) {
        case 'SetNull':
            return 'set null';
        case 'Cascade':
            return 'cascade';
        case 'Restrict':
            return 'restrict';
        case 'NoAction':
            return 'no action';
        case 'SetDefault':
            return 'set default';
    }
}

// #endregion

