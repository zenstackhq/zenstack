/**
 * Database introspection shared by `db pull` (CLI) and the migration engine's `db push`.
 * Produces a plain, language-independent description of the live database schema.
 */

export type Cascade = 'NO ACTION' | 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | null;

export interface IntrospectedTable {
    schema: string;
    name: string;
    type: 'table' | 'view';
    definition: string | null;
    columns: {
        name: string;
        datatype: string;
        datatype_name: string | null;
        length: number | null;
        precision: number | null;
        datatype_schema: string;
        foreign_key_schema: string | null;
        foreign_key_table: string | null;
        foreign_key_column: string | null;
        foreign_key_name: string | null;
        foreign_key_on_update: Cascade;
        foreign_key_on_delete: Cascade;
        pk: boolean;
        computed: boolean;
        nullable: boolean;
        unique: boolean;
        unique_name: string | null;
        default: string | null;
    }[];
    indexes: {
        name: string;
        method: string | null;
        unique: boolean;
        primary: boolean;
        valid: boolean;
        ready: boolean;
        partial: boolean;
        predicate: string | null;
        columns: {
            name: string;
            expression: string | null;
            order: 'ASC' | 'DESC' | null;
            nulls: string | null;
        }[];
    }[];
}

export type IntrospectedEnum = {
    schema_name: string;
    enum_type: string;
    values: string[];
};

export type IntrospectedSchema = {
    tables: IntrospectedTable[];
    enums: IntrospectedEnum[];
};

/** Model-name casing applied to synthesized names (MySQL enums have no physical name). */
export type NameCasing = 'pascal' | 'camel' | 'snake' | 'none';

/** Options for database introspection. */
export interface IntrospectOptions {
    /** Schemas to include (PostgreSQL; ignored by providers without multi-schema support). */
    schemas: string[];

    /** Casing applied to synthesized model names (see {@link NameCasing}). */
    modelCasing: NameCasing;
}
