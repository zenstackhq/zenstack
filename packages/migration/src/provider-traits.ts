import type { DataSourceProviderType } from '@zenstackhq/schema';

/**
 * How a provider physically represents ZModel enums:
 * - `native`: a dedicated database type (PostgreSQL `CREATE TYPE … AS ENUM`)
 * - `inline`: inlined into each using column's type (MySQL `enum('A','B')`)
 * - `text`: plain text, no enforcement (SQLite)
 */
export type EnumStrategy = 'native' | 'inline' | 'text';

/**
 * Per-provider facts the migration engine branches on — data, not behavior. Structural
 * algorithm differences (e.g. which changes the diff emits) stay explicit at their use
 * sites; this table centralizes the flat facts those algorithms consume.
 */
export interface ProviderTraits {
    /** How enums are physically represented. */
    enumStrategy: EnumStrategy;

    /**
     * Default SQL type text per ZModel scalar type.
     */
    scalarTypes: Record<string, string>;

    /** SQL expression for a `@default(now())` column default. */
    nowDefaultSql: string;

    /** Auto-increment uses the serial type family instead of a column modifier. */
    serialAutoIncrement: boolean;

    /**
     * A single-column `Int @id` is emitted as `INTEGER PRIMARY KEY AUTOINCREMENT` even
     * without `@default(autoincrement())`.
     */
    implicitAutoIncrementPk: boolean;

    /**
     * `@db.*` native types apply. When false (SQLite, which is affinity-typed), the engine
     * silently ignores them — note Prisma is stricter and *rejects* native types on its
     * sqlite connector at validation time; ZModel currently accepts them for any provider.
     */
    supportsNativeTypes: boolean;

    /** Single-column FKs can be added inline with `REFERENCES`. */
    inlineForeignKeys: boolean;

    /**
     * In-place column/constraint changes are unsupported — the table is rebuilt to its
     * desired shape instead (SQLite).
     */
    rebuildTableForAlters: boolean;

    /** Column changes restate the whole definition via `MODIFY COLUMN`. */
    alterColumnByRedefinition: boolean;

    /** `DROP INDEX` requires the owning table (`DROP INDEX … ON table`) and has no `IF EXISTS`. */
    dropIndexRequiresTable: boolean;

    /** The primary key is anonymous — dropped via `DROP PRIMARY KEY`, not by constraint name. */
    anonymousPrimaryKey: boolean;

    /**
     * A table rename leaves the primary-key constraint named after the old table
     * (`<old>_pkey`), so the rename must also rename the constraint to keep the
     * `<table>_pkey` convention that `drop-primary-key` relies on.
     */
    renamePkConstraintOnTableRename: boolean;

    /** `DROP TABLE` needs `CASCADE` to also drop dependent FK constraints. */
    dropTableCascade: boolean;

    /**
     * Statements toggling FK enforcement off/on, when the provider supports it.
     */
    fkToggle?: { off: string; on: string };

    /**
     * Identifier length limit for generated constraint/index names.
     */
    maxIdentifierLength: number;
}

const TRAITS: Record<DataSourceProviderType, ProviderTraits> = {
    sqlite: {
        enumStrategy: 'text',
        scalarTypes: {
            String: 'text',
            Boolean: 'boolean',
            Int: 'integer',
            Float: 'real',
            BigInt: 'bigint',
            Decimal: 'decimal',
            DateTime: 'datetime',
            Bytes: 'blob',
            Json: 'jsonb',
        },
        nowDefaultSql: 'CURRENT_TIMESTAMP',
        serialAutoIncrement: false,
        implicitAutoIncrementPk: true,
        supportsNativeTypes: false,
        inlineForeignKeys: true,
        rebuildTableForAlters: true,
        alterColumnByRedefinition: false,
        dropIndexRequiresTable: false,
        anonymousPrimaryKey: false,
        renamePkConstraintOnTableRename: false,
        dropTableCascade: false,
        fkToggle: { off: 'PRAGMA foreign_keys = OFF', on: 'PRAGMA foreign_keys = ON' },
        maxIdentifierLength: Number.POSITIVE_INFINITY,
    },
    postgresql: {
        enumStrategy: 'native',
        scalarTypes: {
            String: 'text',
            Boolean: 'boolean',
            Int: 'integer',
            Float: 'double precision',
            BigInt: 'bigint',
            Decimal: 'decimal(65,30)',
            DateTime: 'timestamp(3)',
            Bytes: 'bytea',
            Json: 'jsonb',
        },
        nowDefaultSql: 'CURRENT_TIMESTAMP',
        serialAutoIncrement: true,
        implicitAutoIncrementPk: false,
        supportsNativeTypes: true,
        inlineForeignKeys: true,
        rebuildTableForAlters: false,
        alterColumnByRedefinition: false,
        dropIndexRequiresTable: false,
        anonymousPrimaryKey: false,
        renamePkConstraintOnTableRename: true,
        dropTableCascade: true,
        maxIdentifierLength: 63,
    },
    mysql: {
        enumStrategy: 'inline',
        scalarTypes: {
            String: 'varchar(191)',
            Boolean: 'tinyint(1)',
            Int: 'integer',
            Float: 'double',
            BigInt: 'bigint',
            Decimal: 'decimal(65, 30)',
            DateTime: 'datetime(3)',
            Bytes: 'longblob',
            Json: 'json',
        },
        nowDefaultSql: 'CURRENT_TIMESTAMP(3)',
        serialAutoIncrement: false,
        implicitAutoIncrementPk: false,
        supportsNativeTypes: true,
        inlineForeignKeys: false,
        rebuildTableForAlters: false,
        alterColumnByRedefinition: true,
        dropIndexRequiresTable: true,
        anonymousPrimaryKey: true,
        renamePkConstraintOnTableRename: false,
        dropTableCascade: false,
        fkToggle: { off: 'SET FOREIGN_KEY_CHECKS = 0', on: 'SET FOREIGN_KEY_CHECKS = 1' },
        maxIdentifierLength: 64,
    },
};

/** The {@link ProviderTraits} of the given provider. */
export function providerTraits(provider: DataSourceProviderType): ProviderTraits {
    return TRAITS[provider];
}
