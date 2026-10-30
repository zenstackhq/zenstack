import type { ZModelServices } from '@zenstackhq/language';
import type { BuiltinType, Enum, Expression } from '@zenstackhq/language/ast';
import type { AstFactory, DataFieldAttributeFactory, ExpressionBuilder } from '@zenstackhq/language/factory';
// the introspection data model lives in @zenstackhq/migration (shared with `db push`)
export type {
    Cascade,
    IntrospectedEnum,
    IntrospectedSchema,
    IntrospectedTable,
    IntrospectOptions,
    NameCasing,
} from '@zenstackhq/migration';

export type DatabaseFeature = 'Schema' | 'NativeEnum';

export interface IntrospectionProvider {
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
