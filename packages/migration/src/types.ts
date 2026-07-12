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
    version: number;
    provider: DataSourceProviderType;
    enums: Record<string, EnumSnapshot>;
    tables: Record<string, TableSnapshot>;
}

export interface EnumSnapshot {
    name: string;
    /** Physical enum values (after `@map`). */
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
    foreignKeys: ForeignKeySnapshot[];
}

export interface IndexSnapshot {
    /** Index name (honors an explicit `map:`; otherwise generated deterministically). */
    name: string;
    columns: string[];
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
    array: boolean;
    nullable: boolean;
    default?: SnapshotDefault;
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

export type SnapshotDefault =
    | { kind: 'literal'; value: string | number | boolean }
    | { kind: 'now' }
    | { kind: 'autoincrement' }
    | { kind: 'call'; function: string };


export interface ForeignKeySnapshot {
    name: string;
    columns: string[];
    refTable: string;
    refColumns: string[];
    onDelete?: CascadeAction;
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
