import type { CascadeAction, DataSourceProviderType } from '@zenstackhq/schema';
import type { Kysely } from 'kysely';

/**
 * Current snapshot format version. Bumped when the on-disk snapshot shape changes
 * in a non-backward-compatible way.
 */
export const SNAPSHOT_VERSION = 1;

/**
 * A stable, provider-independent-ish description of the physical database schema
 * derived from a ZenStack {@link SchemaDef}. Two snapshots are diffed to produce a
 * migration. Persisted as `snapshot.json` inside each migration folder.
 */
export interface Snapshot {
    /** Snapshot format version ({@link SNAPSHOT_VERSION} at the time of writing). */
    version: number;

    /** The datasource provider the snapshot was built for (type mappings are provider-specific). */
    provider: DataSourceProviderType;

    /** Enums, keyed by physical enum name. */
    enums: Record<string, EnumSnapshot>;

    /** Tables, keyed by physical table name. */
    tables: Record<string, TableSnapshot>;
}

/** An enum (a native database type on PostgreSQL; inlined/text on MySQL/SQLite). */
export interface EnumSnapshot {
    /** Physical enum (type) name (after `@@map`). */
    name: string;

    /** Physical enum values (after `@map`), in declaration order — the order is physical on PostgreSQL. */
    values: string[];
}

export interface TableSnapshot {
    /** Physical table name (after `@@map`). */
    name: string;

    /** Keyed by physical column name. */
    columns: Record<string, ColumnSnapshot>;

    /** Physical column names forming a multi-column primary key. Empty when the PK is a single field-level `@id`. */
    primaryKey: string[];

    /** Indexes (including unique indexes from `@unique`/`@@unique` and regular ones from `@@index`). */
    indexes: IndexSnapshot[];

    /** Foreign keys owned by this table (one per relation with foreign-key fields on this side). */
    foreignKeys: ForeignKeySnapshot[];
}

/** A (unique) index on a table. */
export interface IndexSnapshot {
    /** Index name (honors an explicit `map:`; otherwise generated deterministically, Prisma-style). */
    name: string;

    /** Physical column names, in index order. */
    columns: string[];

    /** Whether this is a unique index (from `@unique`/`@@unique`) rather than a plain `@@index`. */
    unique: boolean;
}

export interface ColumnSnapshot {
    /** Physical column name (after `@map`). */
    name: string;

    /** Logical type: a `BuiltinType`, an enum name, or a type-def name. */
    type: string;

    /** Whether {@link type} references an enum. */
    isEnum: boolean;

    /** Whether the column stores JSON (native `Json` field or a strongly-typed JSON `type` def). */
    isJson: boolean;

    /** Whether the column holds a list (`Type[]` field — physical array types on PostgreSQL). */
    array: boolean;

    /** Whether the column allows NULL (optional fields; array columns are also nullable). */
    nullable: boolean;

    /** The column's default, when it has one relevant to DDL (see {@link SnapshotDefault}). */
    default?: SnapshotDefault;

    /** `@default(autoincrement())` — serial type on PostgreSQL, `AUTO_INCREMENT` on MySQL, rowid alias on SQLite. */
    autoIncrement: boolean;

    /** Single field-level `@id`. */
    primaryKey: boolean;

    /** Field-level `@unique`. */
    unique: boolean;

    /** Prisma-style native database type (`@db.*`), if declared, overriding the default type mapping. */
    nativeType?: NativeTypeSnapshot;
}

/** A Prisma-style native database type attribute, e.g. `@db.VarChar(200)` -> `{ name: 'VarChar', args: [200] }`. */
export interface NativeTypeSnapshot {
    /** The native type name without the `@db.` prefix (e.g. `VarChar`, `Uuid`, `Decimal`). */
    name: string;

    /** Literal arguments (length/precision), e.g. `[200]` or `[10, 2]`. */
    args: Array<string | number>;
}

/** A column default as captured from `@default(...)`. */
export type SnapshotDefault =
    // A literal value, emitted as a plain DEFAULT.
    | { kind: 'literal'; value: string | number | boolean }
    // `@default(now())`, emitted as the provider's current-timestamp expression.
    | { kind: 'now' }
    // `@default(autoincrement())`, realized via the serial type / auto-increment modifier
    // rather than a DEFAULT clause (see ColumnSnapshot.autoIncrement).
    | { kind: 'autoincrement' }
    // A runtime generator function (`uuid()`, `cuid()`, `nanoid()`, ...) — values are computed
    // client-side by the ORM, so no DB-level DEFAULT is emitted.
    | { kind: 'call'; function: string }
    // Raw SQL from `@default(dbgenerated("..."))`, emitted verbatim as the DEFAULT clause.
    | { kind: 'raw'; sql: string };

/** A foreign-key constraint. `columns` and `refColumns` are pairwise aligned. */
export interface ForeignKeySnapshot {
    /** Constraint name (generated deterministically, Prisma-style). */
    name: string;

    /** Physical foreign-key column names on the owning table. */
    columns: string[];

    /** Physical name of the referenced table. */
    refTable: string;

    /** Physical names of the referenced columns (aligned with {@link columns}). */
    refColumns: string[];

    /** `onDelete` referential action; absent means the provider's default. */
    onDelete?: CascadeAction;

    /** `onUpdate` referential action; absent means the provider's default. */
    onUpdate?: CascadeAction;
}

/**
 * The shape of a generated (and user-editable) `migration.ts` module.
 *
 * `migrate` receives a Kysely {@link Kysely} query builder and performs both the schema
 * (DDL) changes and any custom data transformations (use `db` for both).
 */
export interface MigrationModule {
    migrate: (db: Kysely<any>) => Promise<void>;
}
