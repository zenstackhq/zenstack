import type { ZModelServices } from '@zenstackhq/language';
import type { BuiltinType, Enum, Expression } from '@zenstackhq/language/ast';
import type { AstFactory, DataFieldAttributeFactory, ExpressionBuilder } from '@zenstackhq/language/factory';

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

export type DatabaseFeature = 'Schema' | 'NativeEnum';

export interface IntrospectionProvider {
    introspect(connectionString: string, options: { schemas: string[]; modelCasing: 'pascal' | 'camel' | 'snake' | 'none' }): Promise<IntrospectedSchema>;
    getBuiltinType(type: string): {
        type: BuiltinType | 'Unsupported';
        isArray: boolean;
    };
    getDefaultDatabaseType(type: BuiltinType): { precision?: number; type: string } | undefined;
    /**
     * Get the expression builder callback for a field's @default attribute value.
     * Returns null if no @default attribute should be added.
     * The callback will be passed to DataFieldAttributeFactory.addArg().
     */
    getDefaultValue(args: {
        fieldType: BuiltinType | 'Unsupported';
        datatype: string;
        datatype_name: string | null;
        defaultValue: string;
        services: ZModelServices;
        enums: Enum[];
    }): ((builder: ExpressionBuilder) => AstFactory<Expression>) | null;
    /**
     * Get additional field attributes based on field type and name (e.g., @updatedAt for DateTime fields, @db.* attributes).
     * This is separate from getDefaultValue to keep concerns separated.
     */
    getFieldAttributes(args: {
        fieldName: string;
        fieldType: BuiltinType | 'Unsupported';
        datatype: string;
        length: number | null;
        precision: number | null;
        services: ZModelServices;
    }): DataFieldAttributeFactory[];
    isSupportedFeature(feature: DatabaseFeature): boolean;
}
