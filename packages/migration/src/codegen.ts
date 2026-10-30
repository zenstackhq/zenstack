import type { CascadeAction, DataSourceProviderType } from '@zenstackhq/schema';
import { primaryKeyName } from './conventions';
import type { SchemaChange } from './diff';
import { providerTraits } from './provider-traits';
import { emitColumnType, sqlTypeText } from './type-mapping';
import type { ColumnSnapshot, ForeignKeySnapshot, IndexSnapshot, Snapshot, TableSnapshot } from './types';

type Provider = DataSourceProviderType;

/** The {@link SchemaChange} variant with the given kind. */
type ChangeOf<Kind extends SchemaChange['kind']> = Extract<SchemaChange, { kind: Kind }>;

// a registry of emit handlers marked with @emit
const emitHandlers = new Map<SchemaChange['kind'], PropertyDescriptor>();

// emit handler decorator
function emit(kind: SchemaChange['kind']) {
    return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
        if (!emitHandlers.has(kind)) {
            emitHandlers.set(kind, descriptor);
        }
        return descriptor;
    };
}

/** Options adjusting how the migrate body is generated. */
export interface MigrateBodyOptions {
    /**
     * Emit lenient DDL for state-based sync (`db push`): drops use `ifExists` so syncing
     * over a partially matching database doesn't fail. Migration files stay strict.
     */
    lenient?: boolean;
}

/** Generates the body (statements) of the `migrate` function for the given changes. */
export function generateMigrateBody(
    changes: SchemaChange[],
    provider: Provider,
    snapshot: Snapshot,
    options?: MigrateBodyOptions,
): string {
    return new MigrationCodeGenerator(provider, snapshot, options).generate(changes);
}

/** The literal default to restore after an enum recreate, when its value survived the change. */
export function restorableEnumDefault(column: ColumnSnapshot, enumDef: { values: string[] }): string | undefined {
    const def = column.default;
    return def?.kind === 'literal' && typeof def.value === 'string' && enumDef.values.includes(def.value)
        ? def.value
        : undefined;
}

/**
 * Generates `migration.ts` statements from schema changes. Each change kind is handled by
 * the method marked with the corresponding `@emit(kind)`.
 */
class MigrationCodeGenerator {
    constructor(
        private readonly provider: Provider,
        private readonly snapshot: Snapshot,
        private readonly options?: MigrateBodyOptions,
    ) {}

    generate(changes: SchemaChange[]): string {
        return changes
            .map((change) => this.emitChange(change))
            .filter((statement) => statement.length > 0)
            .join('\n\n');
    }

    private emitChange(change: SchemaChange): string {
        const handler = emitHandlers.get(change.kind);
        if (!handler) {
            throw new Error(`No emit handler found for ${change.kind}`);
        }
        return handler.value.call(this, change) as string;
    }

    private get traits() {
        return providerTraits(this.provider);
    }

    /** `.ifExists()` in lenient (push) mode, nothing in strict (migration file) mode. */
    private get ifExists() {
        return this.options?.lenient ? '.ifExists()' : '';
    }

    @emit('create-enum')
    _createEnum(change: ChangeOf<'create-enum'>) {
        if (this.traits.enumStrategy !== 'native') {
            // inline/text providers don't materialize the enum — nothing to create
            return '';
        }
        const values = change.enum.values.map((v) => `'${v}'`).join(', ');
        return `    await db.schema.createType('${change.enum.name}').asEnum([${values}]).execute();`;
    }

    @emit('drop-enum')
    _dropEnum(change: ChangeOf<'drop-enum'>) {
        if (this.traits.enumStrategy !== 'native') {
            // inline/text providers don't materialize the enum — nothing to drop
            return '';
        }
        return `    await db.schema.dropType('${change.enum.name}')${this.ifExists}.execute();`;
    }

    /** An `ALTER TYPE … ADD VALUE` statement per value appended to a native enum. */
    @emit('alter-enum-add-values')
    _enumAddValues(change: ChangeOf<'alter-enum-add-values'>) {
        return change.added
            .map(
                (value) =>
                    `    await sql\`ALTER TYPE "${change.enum.name}" ADD VALUE IF NOT EXISTS '${sqlLiteral(value)}'\`.execute(db);`,
            )
            .join('\n');
    }

    /**
     * Recreates an enum whose values were removed or reordered: create a `<name>_new` type, cast
     * every using column over (`USING col::text::new`), then swap the names and drop the old type.
     * Column defaults must be dropped before the cast; they are restored afterwards when their
     * value still exists in the new enum, otherwise the cast fails at apply time if a removed value
     * is still present in the data.
     */
    @emit('recreate-enum')
    _recreateEnum(change: ChangeOf<'recreate-enum'>) {
        const enumDef = change.enum;
        if (this.traits.enumStrategy !== 'native') {
            // inline/text for non-native providers — nothing to recreate
            return ``;
        }
        const newName = `${enumDef.name}_new`;
        const oldName = `${enumDef.name}_old`;
        const values = enumDef.values.map((v) => `'${sqlLiteral(v)}'`).join(', ');
        const lines = [`    await db.schema.createType('${newName}').asEnum([${values}]).execute();`];
        for (const { table, column } of change.columns) {
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
        for (const { table, column } of change.columns) {
            const value = restorableEnumDefault(column, enumDef);
            if (value !== undefined) {
                lines.push(
                    `    await db.schema.alterTable('${table}').alterColumn('${column.name}', (col) => col.setDefault('${sqlLiteral(value)}')).execute();`,
                );
            }
        }
        return lines.join('\n');
    }

    /** Only emitted for native-enum providers; using columns follow the renamed type automatically. */
    @emit('rename-enum')
    _renameEnum(change: ChangeOf<'rename-enum'>) {
        return `    await sql\`ALTER TYPE "${change.from}" RENAME TO "${change.to.name}"\`.execute(db);`;
    }

    /** The CREATE TABLE statement followed by CREATE INDEX statements for the table's indexes. */
    @emit('create-table')
    _createTable(change: ChangeOf<'create-table'>) {
        return [
            this.createTable(change.table),
            ...change.table.indexes.map((index) => this.createIndex(change.table.name, index)),
        ].join('\n\n');
    }

    @emit('drop-table')
    _dropTable(change: ChangeOf<'drop-table'>) {
        return `    await db.schema.dropTable('${change.table.name}')${this.ifExists}.execute();`;
    }

    @emit('rename-table')
    _renameTable(change: ChangeOf<'rename-table'>) {
        return `    await db.schema.alterTable('${change.from}').renameTo('${change.to.name}').execute();`;
    }

    /** Renames the PK constraint after a table rename, keeping the `<table>_pkey` convention true. */
    @emit('rename-primary-key')
    _renamePrimaryKey(change: ChangeOf<'rename-primary-key'>) {
        return `    await sql\`ALTER TABLE "${change.table.name}" RENAME CONSTRAINT "${primaryKeyName(this.provider, change.from)}" TO "${primaryKeyName(this.provider, change.table.name)}"\`.execute(db);`;
    }

    @emit('add-column')
    _addColumn(change: ChangeOf<'add-column'>) {
        const { table, column, fk } = change;
        const type = emitColumnType(this.provider, column, this.snapshot);
        let modifiers = this.columnModifiers(column).join('');
        if (fk && fk.refColumns.length === 1) {
            // add the foreign key inline (only providers supporting it reach here)
            modifiers += `.references('${fk.refTable}.${fk.refColumns[0]}')`;
            if (fk.onDelete) {
                modifiers += `.onDelete('${mapCascade(fk.onDelete)}')`;
            }
            if (fk.onUpdate) {
                modifiers += `.onUpdate('${mapCascade(fk.onUpdate)}')`;
            }
        }
        const colArg =
            modifiers.length === 0
                ? `'${column.name}', ${type}`
                : `'${column.name}', ${type}, (col) => col${modifiers}`;
        return `    await db.schema.alterTable('${table.name}').addColumn(${colArg}).execute();`;
    }

    @emit('drop-column')
    _dropColumn(change: ChangeOf<'drop-column'>) {
        return `    await db.schema.alterTable('${change.table.name}').dropColumn('${change.column.name}').execute();`;
    }

    @emit('rename-column')
    _renameColumn(change: ChangeOf<'rename-column'>) {
        return `    await db.schema.alterTable('${change.table.name}').renameColumn('${change.from}', '${change.column.name}').execute();`;
    }

    /** The statements for an in-place column change (type / nullability / default). */
    @emit('alter-column')
    _alterColumn(change: ChangeOf<'alter-column'>) {
        const { table, from, to } = change;

        if (this.traits.alterColumnByRedefinition) {
            // no granular ALTER COLUMN — redefine the whole column with MODIFY COLUMN
            const type = emitColumnType(this.provider, to, this.snapshot);
            const mods: string[] = [];
            if (to.autoIncrement) {
                mods.push('.autoIncrement()'); // must be restated or the column loses it
            }
            const value = this.defaultValue(to);
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
        const alter = (op: string) =>
            `    await db.schema.alterTable('${table.name}').alterColumn('${to.name}', (col) => ${op}).execute();`;

        if (sqlTypeText(this.provider, from, this.snapshot) !== sqlTypeText(this.provider, to, this.snapshot)) {
            stmts.push(alter(`col.setDataType(${emitColumnType(this.provider, to, this.snapshot)})`));
        }
        if (from.nullable !== to.nullable) {
            stmts.push(alter(to.nullable ? 'col.dropNotNull()' : 'col.setNotNull()'));
        }
        if (JSON.stringify(from.default) !== JSON.stringify(to.default)) {
            const value = this.defaultValue(to);
            if (value !== undefined) {
                stmts.push(alter(`col.setDefault(${value})`));
            } else if (from.default) {
                stmts.push(alter('col.dropDefault()'));
            }
        }
        return stmts.join('\n\n');
    }

    @emit('create-index')
    _createIndex(change: ChangeOf<'create-index'>) {
        return this.createIndex(change.table.name, change.index);
    }

    @emit('drop-index')
    _dropIndex(change: ChangeOf<'drop-index'>) {
        return this.traits.dropIndexRequiresTable
            ? `    await db.schema.dropIndex('${change.index.name}').on('${change.table.name}').execute();`
            : `    await db.schema.dropIndex('${change.index.name}')${this.ifExists}.execute();`;
    }

    /** An `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY …` statement. */
    @emit('add-foreign-key')
    _addForeignKey(change: ChangeOf<'add-foreign-key'>) {
        const fk = change.fk;
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
        return `    await db.schema.alterTable('${change.table.name}').addForeignKeyConstraint('${fk.name}', [${cols}], '${fk.refTable}', [${refCols}]${cb}).execute();`;
    }

    @emit('drop-foreign-key')
    _dropForeignKey(change: ChangeOf<'drop-foreign-key'>) {
        return `    await db.schema.alterTable('${change.table.name}').dropConstraint('${change.fk.name}').execute();`;
    }

    /** MySQL's primary key is always named PRIMARY — drop it with DROP PRIMARY KEY. */
    @emit('drop-primary-key')
    _dropPrimaryKey(change: ChangeOf<'drop-primary-key'>) {
        return this.traits.anonymousPrimaryKey
            ? `    await sql.raw('ALTER TABLE \`${change.table.name}\` DROP PRIMARY KEY').execute(db);`
            : `    await db.schema.alterTable('${change.table.name}').dropConstraint('${primaryKeyName(this.provider, change.table.name)}').execute();`;
    }

    @emit('add-primary-key')
    _addPrimaryKey(change: ChangeOf<'add-primary-key'>) {
        const cols = change.columns.map((c) => `'${c}'`).join(', ');
        return `    await db.schema.alterTable('${change.table.name}').addPrimaryKeyConstraint('${primaryKeyName(this.provider, change.table.name)}', [${cols}]).execute();`;
    }

    @emit('rebuild-table')
    _rebuildTable(change: ChangeOf<'rebuild-table'>) {
        const { table, copyColumns } = change;
        const temp = `_zenstack_new_${table.name}`;
        const targets = copyColumns.map((c) => `"${c.target}"`).join(', ');
        const sources = copyColumns.map((c) => `"${c.source}"`).join(', ');
        const lines = [
            '    await sql`PRAGMA foreign_keys = OFF`.execute(db);',
            this.createTable(table, temp),
            ...(copyColumns.length > 0
                ? [
                      `    await sql\`INSERT INTO "${temp}" (${targets}) SELECT ${sources} FROM "${table.name}"\`.execute(db);`,
                  ]
                : []),
            `    await db.schema.dropTable('${table.name}').execute();`,
            `    await sql\`ALTER TABLE "${temp}" RENAME TO "${table.name}"\`.execute(db);`,
            ...table.indexes.map((index) => this.createIndex(table.name, index)),
            '    await sql`PRAGMA foreign_keys = ON`.execute(db);',
        ];
        return lines.join('\n\n');
    }

    @emit('unsupported')
    _unsupported(change: ChangeOf<'unsupported'>) {
        return `    // TODO: unsupported automatic change — please author this manually:\n    //   ${change.description}`;
    }

    // #region shared building blocks

    private createTable(table: TableSnapshot, nameOverride?: string): string {
        const lines: string[] = [`    await db.schema.createTable('${nameOverride ?? table.name}')`];

        for (const column of Object.values(table.columns)) {
            lines.push(this.columnDefinition(column));
        }

        if (table.primaryKey.length > 0) {
            const cols = table.primaryKey.map((c) => `'${c}'`).join(', ');
            lines.push(`        .addPrimaryKeyConstraint('${primaryKeyName(this.provider, table.name)}', [${cols}])`);
        }

        for (const fk of table.foreignKeys) {
            lines.push(this.foreignKeyConstraint(fk));
        }

        lines.push('        .execute();');
        return lines.join('\n');
    }

    private createIndex(tableName: string, index: IndexSnapshot): string {
        const cols = index.columns.map((c) => `'${c}'`).join(', ');
        const unique = index.unique ? '.unique()' : '';
        return `    await db.schema.createIndex('${index.name}')${unique}.on('${tableName}').columns([${cols}]).execute();`;
    }

    private columnDefinition(column: ColumnSnapshot): string {
        const type = emitColumnType(this.provider, column, this.snapshot);
        const modifiers = this.columnModifiers(column);
        if (modifiers.length === 0) {
            return `        .addColumn('${column.name}', ${type})`;
        }
        return `        .addColumn('${column.name}', ${type}, (col) => col${modifiers.join('')})`;
    }

    private columnModifiers(column: ColumnSnapshot): string[] {
        const mods: string[] = [];
        if (column.primaryKey) {
            mods.push('.primaryKey()');
        }
        // postgres uses the `serial` type instead of an autoIncrement modifier; SQLite makes
        // every single-column Int pk auto-increment, matching Prisma
        const autoIncrement =
            column.autoIncrement ||
            (this.traits.implicitAutoIncrementPk && column.primaryKey && column.type === 'Int' && !column.array);
        if (autoIncrement && !this.traits.serialAutoIncrement) {
            mods.push('.autoIncrement()');
        }
        const defaultValue = this.defaultValue(column);
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
    private defaultValue(column: ColumnSnapshot): string | undefined {
        const def = column.default;
        if (!def) {
            return undefined;
        }
        switch (def.kind) {
            case 'literal':
                return typeof def.value === 'string' ? `'${sqlLiteral(def.value)}'` : `${def.value}`;
            case 'now':
                return `sql\`${this.traits.nowDefaultSql}\``;
            case 'autoincrement':
                // handled via the serial type / autoIncrement modifier
                return undefined;
            case 'call':
                // runtime generator functions (uuid()/cuid()/...) — values are computed by the
                // ORM client side, so no DB-level default is emitted
                return undefined;
            case 'raw':
                // raw SQL from `@default(dbgenerated("..."))`, emitted verbatim
                return `sql\`${tsTemplateText(def.sql)}\``;
        }
    }

    private foreignKeyConstraint(fk: ForeignKeySnapshot): string {
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

    // #endregion
}

/** Escapes a string for embedding in a single-quoted SQL/TS literal. */
function sqlLiteral(value: string): string {
    return value.replace(/'/g, "\\'");
}

/** Escapes text for embedding inside a generated TS template literal. */
function tsTemplateText(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
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
