import type { ZModelServices } from '@zenstackhq/language';
import type { Attribute, BuiltinType, Enum, Expression } from '@zenstackhq/language/ast';
import { AstFactory, DataFieldAttributeFactory, ExpressionBuilder } from '@zenstackhq/language/factory';
import { CliError } from '../../../cli-error';
import { getAttributeRef, getDbName, getFunctionRef, normalizeDecimalDefault, normalizeFloatDefault } from '../utils';
import type { IntrospectionProvider } from './provider';

/**
 * Maps PostgreSQL internal type names to their standard SQL names for comparison.
 * This is used to normalize type names when checking against default database types.
 */
const pgTypnameToStandard: Record<string, string> = {
    int2: 'smallint',
    int4: 'integer',
    int8: 'bigint',
    float4: 'real',
    float8: 'double precision',
    bool: 'boolean',
    bpchar: 'character',
    numeric: 'decimal',
};

/**
 * Standard bit widths for integer/float types that shouldn't be added as precision arguments.
 * PostgreSQL returns these as precision values, but they're implicit for the type.
 */
const standardTypePrecisions: Record<string, number> = {
    int2: 16,
    smallint: 16,
    int4: 32,
    integer: 32,
    int8: 64,
    bigint: 64,
    float4: 24,
    real: 24,
    float8: 53,
    'double precision': 53,
};

/**
 * Maps PostgreSQL typnames (from pg_type.typname) to ZenStack native type attribute names.
 * PostgreSQL introspection returns internal type names like 'int2', 'int4', 'float8', 'bpchar',
 * but ZenStack attributes are named @db.SmallInt, @db.Integer, @db.DoublePrecision, @db.Char, etc.
 */
const pgTypnameToZenStackNativeType: Record<string, string> = {
    // integers
    int2: 'SmallInt',
    smallint: 'SmallInt',
    int4: 'Integer',
    integer: 'Integer',
    int8: 'BigInt',
    bigint: 'BigInt',

    // decimals and floats
    numeric: 'Decimal',
    decimal: 'Decimal',
    float4: 'Real',
    real: 'Real',
    float8: 'DoublePrecision',
    'double precision': 'DoublePrecision',

    // boolean
    bool: 'Boolean',
    boolean: 'Boolean',

    // strings
    text: 'Text',
    varchar: 'VarChar',
    'character varying': 'VarChar',
    bpchar: 'Char',
    character: 'Char',

    // uuid
    uuid: 'Uuid',

    // dates/times
    date: 'Date',
    time: 'Time',
    timetz: 'Timetz',
    timestamp: 'Timestamp',
    timestamptz: 'Timestamptz',

    // binary
    bytea: 'ByteA',

    // json
    json: 'Json',
    jsonb: 'JsonB',

    // xml
    xml: 'Xml',

    // network types
    inet: 'Inet',

    // bit strings
    bit: 'Bit',
    varbit: 'VarBit',

    // oid
    oid: 'Oid',

    // money
    money: 'Money',

    // citext extension
    citext: 'Citext',
};

export const postgresql: IntrospectionProvider = {
    isSupportedFeature(feature) {
        const supportedFeatures = ['Schema', 'NativeEnum'];
        return supportedFeatures.includes(feature);
    },
    getBuiltinType(type) {
        const t = (type || '').toLowerCase();

        const isArray = t.startsWith('_');

        switch (t.replace(/^_/, '')) {
            // integers
            case 'int2':
            case 'smallint':
            case 'int4':
            case 'integer':
                return { type: 'Int', isArray };
            case 'int8':
            case 'bigint':
                return { type: 'BigInt', isArray };

            // decimals and floats
            case 'numeric':
            case 'decimal':
                return { type: 'Decimal', isArray };
            case 'float4':
            case 'real':
            case 'float8':
            case 'double precision':
                return { type: 'Float', isArray };

            // boolean
            case 'bool':
            case 'boolean':
                return { type: 'Boolean', isArray };

            // strings
            case 'text':
            case 'varchar':
            case 'bpchar':
            case 'character varying':
            case 'character':
                return { type: 'String', isArray };

            // uuid
            case 'uuid':
                return { type: 'String', isArray };

            // dates/times
            case 'date':
            case 'time':
            case 'timetz':
            case 'timestamp':
            case 'timestamptz':
                return { type: 'DateTime', isArray };

            // binary
            case 'bytea':
                return { type: 'Bytes', isArray };

            // json
            case 'json':
            case 'jsonb':
                return { type: 'Json', isArray };
            default:
                return { type: 'Unsupported' as const, isArray };
        }
    },
    getDefaultDatabaseType(type: BuiltinType) {
        switch (type) {
            case 'String':
                return { type: 'text' };
            case 'Boolean':
                return { type: 'boolean' };
            case 'Int':
                return { type: 'integer' };
            case 'BigInt':
                return { type: 'bigint' };
            case 'Float':
                return { type: 'double precision' };
            case 'Decimal':
                return { type: 'decimal' };
            case 'DateTime':
                return { type: 'timestamp', precision: 3 };
            case 'Json':
                return { type: 'jsonb' };
            case 'Bytes':
                return { type: 'bytea' };
        }
    },
    getDefaultValue({ defaultValue, fieldType, datatype, datatype_name, services, enums }) {
        const val = defaultValue.trim();

        // Handle enum defaults (PostgreSQL returns 'value'::enum_type)
        if (datatype === 'enum' && datatype_name) {
            const enumDef = enums.find((e) => getDbName(e) === datatype_name);
            if (enumDef) {
                // Extract the enum value from the default (format: 'VALUE'::"enum_type")
                const enumValue = val.replace(/'/g, '').split('::')[0]?.trim();
                const enumField = enumDef.fields.find((f) => getDbName(f) === enumValue);
                if (enumField) {
                    return (ab) => ab.ReferenceExpr.setTarget(enumField);
                }
            }
            // Fall through to typeCastingConvert if datatype_name lookup fails
            return typeCastingConvert({ defaultValue, enums, val, services });
        }

        switch (fieldType) {
            case 'DateTime':
                if (val === 'CURRENT_TIMESTAMP' || val === 'now()') {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('now', services));
                }

                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }

                // Fallback to string literal for other DateTime defaults
                return (ab) => ab.StringLiteral.setValue(val);

            case 'Int':
            case 'BigInt':
                if (val.startsWith('nextval(')) {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('autoincrement', services));
                }

                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }
                return (ab) => ab.NumberLiteral.setValue(val);

            case 'Float':
                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }
                return normalizeFloatDefault(val);

            case 'Decimal':
                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }
                return normalizeDecimalDefault(val);

            case 'Boolean':
                return (ab) => ab.BooleanLiteral.setValue(val === 'true');

            case 'String':
                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }

                if (val.startsWith("'") && val.endsWith("'")) {
                    return (ab) => ab.StringLiteral.setValue(val.slice(1, -1).replace(/''/g, "'"));
                }
                return (ab) => ab.StringLiteral.setValue(val);
            case 'Json':
                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }
                return (ab) => ab.StringLiteral.setValue(val);
            case 'Bytes':
                if (val.includes('::')) {
                    return typeCastingConvert({ defaultValue, enums, val, services });
                }
                return (ab) => ab.StringLiteral.setValue(val);
        }

        if (val.includes('(') && val.includes(')')) {
            return (ab) =>
                ab.InvocationExpr.setFunction(getFunctionRef('dbgenerated', services)).addArg((a) =>
                    a.setValue((v) => v.StringLiteral.setValue(val)),
                );
        }

        console.warn(
            `Unsupported default value type: "${defaultValue}" for field type "${fieldType}". Skipping default value.`,
        );
        return null;
    },

    getFieldAttributes({ fieldName, fieldType, datatype, length, precision, services }) {
        const factories: DataFieldAttributeFactory[] = [];

        // Add @updatedAt for DateTime fields named updatedAt or updated_at
        if (
            fieldType === 'DateTime' &&
            (fieldName.toLowerCase() === 'updatedat' || fieldName.toLowerCase() === 'updated_at')
        ) {
            factories.push(new DataFieldAttributeFactory().setDecl(getAttributeRef('@updatedAt', services)));
        }

        // Map PostgreSQL typname to ZenStack native type attribute name
        // PostgreSQL returns typnames like 'int2', 'float8', 'bpchar', but ZenStack attributes
        // are named @db.SmallInt, @db.DoublePrecision, @db.Char, etc.
        const nativeTypeName = pgTypnameToZenStackNativeType[datatype.toLowerCase()] ?? datatype;

        // Add @db.* attribute if the datatype differs from the default
        const dbAttr = services.shared.workspace.IndexManager.allElements('Attribute').find(
            (d) => d.name.toLowerCase() === `@db.${nativeTypeName.toLowerCase()}`,
        )?.node as Attribute | undefined;

        const defaultDatabaseType = this.getDefaultDatabaseType(fieldType as BuiltinType);

        // Normalize datatype for comparison (e.g., 'int4' -> 'integer')
        const normalizedDatatype = pgTypnameToStandard[datatype.toLowerCase()] ?? datatype.toLowerCase();

        // Check if the precision is the standard bit width for this type (shouldn't be added)
        const standardPrecision = standardTypePrecisions[datatype.toLowerCase()];
        const isStandardPrecision = standardPrecision !== undefined && precision === standardPrecision;

        if (
            dbAttr &&
            defaultDatabaseType &&
            (defaultDatabaseType.type !== normalizedDatatype ||
                (defaultDatabaseType.precision && defaultDatabaseType.precision !== (length ?? precision)))
        ) {
            const dbAttrFactory = new DataFieldAttributeFactory().setDecl(dbAttr);
            // Only add length/precision if it's meaningful (not the standard bit width for the type)
            if ((length || precision) && !isStandardPrecision) {
                dbAttrFactory.addArg((a) => a.NumberLiteral.setValue(length! || precision!));
            }
            factories.push(dbAttrFactory);
        }

        return factories;
    },
};

function typeCastingConvert({
    defaultValue,
    enums,
    val,
    services,
}: {
    val: string;
    enums: Enum[];
    defaultValue: string;
    services: ZModelServices;
}): ((builder: ExpressionBuilder) => AstFactory<Expression>) | null {
    const [value, type] = val
        .replace(/'/g, '')
        .split('::')
        .map((s) => s.trim()) as [string, string];
    switch (type) {
        case 'character varying':
        case 'uuid':
        case 'json':
        case 'jsonb':
        case 'text':
            if (value === 'NULL') return null;
            return (ab) => ab.StringLiteral.setValue(value);
        case 'real':
            return (ab) => ab.NumberLiteral.setValue(value);
        default: {
            const enumDef = enums.find((e) => getDbName(e, true) === type);
            if (!enumDef) {
                return (ab) =>
                    ab.InvocationExpr.setFunction(getFunctionRef('dbgenerated', services)).addArg((a) =>
                        a.setValue((v) => v.StringLiteral.setValue(val)),
                    );
            }
            const enumField = enumDef.fields.find((v) => getDbName(v) === value);
            if (!enumField) {
                throw new CliError(`Enum value ${value} not found in enum ${type} for default value ${defaultValue}`);
            }
            return (ab) => ab.ReferenceExpr.setTarget(enumField);
        }
    }
}
