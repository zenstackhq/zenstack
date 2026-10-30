import type { Attribute, BuiltinType } from '@zenstackhq/language/ast';
import { DataFieldAttributeFactory } from '@zenstackhq/language/factory';
import { getAttributeRef, getDbName, getFunctionRef, normalizeDecimalDefault, normalizeFloatDefault } from '../utils';
import type { IntrospectionProvider } from './provider';

export const mysql: IntrospectionProvider = {
    isSupportedFeature(feature) {
        switch (feature) {
            case 'NativeEnum':
                return true;
            case 'Schema':
            default:
                return false;
        }
    },
    getBuiltinType(type) {
        const t = (type || '').toLowerCase().trim();

        // MySQL doesn't have native array types
        const isArray = false;

        switch (t) {
            // integers
            case 'tinyint':
            case 'smallint':
            case 'mediumint':
            case 'int':
            case 'integer':
                return { type: 'Int', isArray };
            case 'bigint':
                return { type: 'BigInt', isArray };

            // decimals and floats
            case 'decimal':
            case 'numeric':
                return { type: 'Decimal', isArray };
            case 'float':
            case 'double':
            case 'real':
                return { type: 'Float', isArray };

            // boolean (MySQL uses TINYINT(1) for boolean)
            case 'boolean':
            case 'bool':
                return { type: 'Boolean', isArray };

            // strings
            case 'char':
            case 'varchar':
            case 'tinytext':
            case 'text':
            case 'mediumtext':
            case 'longtext':
                return { type: 'String', isArray };

            // dates/times
            case 'date':
            case 'time':
            case 'datetime':
            case 'timestamp':
            case 'year':
                return { type: 'DateTime', isArray };

            // binary
            case 'binary':
            case 'varbinary':
            case 'tinyblob':
            case 'blob':
            case 'mediumblob':
            case 'longblob':
                return { type: 'Bytes', isArray };

            // json
            case 'json':
                return { type: 'Json', isArray };

            default:
                // Handle ENUM type - MySQL returns enum values like "enum('val1','val2')"
                if (t.startsWith('enum(')) {
                    return { type: 'String', isArray };
                }
                // Handle SET type
                if (t.startsWith('set(')) {
                    return { type: 'String', isArray };
                }
                return { type: 'Unsupported' as const, isArray };
        }
    },
    getDefaultDatabaseType(type: BuiltinType) {
        switch (type) {
            case 'String':
                return { type: 'varchar', precision: 191 };
            case 'Boolean':
                // Boolean maps to 'boolean' (our synthetic type from tinyint(1))
                // No precision needed since we handle the mapping in the query
                return { type: 'boolean' };
            case 'Int':
                return { type: 'int' };
            case 'BigInt':
                return { type: 'bigint' };
            case 'Float':
                return { type: 'double' };
            case 'Decimal':
                return { type: 'decimal', precision: 65 };
            case 'DateTime':
                return { type: 'datetime', precision: 3 };
            case 'Json':
                return { type: 'json' };
            case 'Bytes':
                return { type: 'longblob' };
        }
    },
    getDefaultValue({ defaultValue, fieldType, datatype, datatype_name, services, enums }) {
        const val = defaultValue.trim();

        // Handle NULL early
        if (val.toUpperCase() === 'NULL') {
            return null;
        }

        // Handle enum defaults
        if (datatype === 'enum' && datatype_name) {
            const enumDef = enums.find((e) => getDbName(e) === datatype_name);
            if (enumDef) {
                // Strip quotes from the value (MySQL returns 'value')
                const enumValue = val.startsWith("'") && val.endsWith("'") ? val.slice(1, -1) : val;
                const enumField = enumDef.fields.find((f) => getDbName(f) === enumValue);
                if (enumField) {
                    return (ab) => ab.ReferenceExpr.setTarget(enumField);
                }
            }
        }

        switch (fieldType) {
            case 'DateTime':
                if (
                    /^CURRENT_TIMESTAMP(\(\d*\))?$/i.test(val) ||
                    val.toLowerCase() === 'current_timestamp()' ||
                    val.toLowerCase() === 'now()'
                ) {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('now', services));
                }
                // Fallback to string literal for other DateTime defaults
                return (ab) => ab.StringLiteral.setValue(val);

            case 'Int':
            case 'BigInt':
                if (val.toLowerCase() === 'auto_increment') {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('autoincrement', services));
                }
                return (ab) => ab.NumberLiteral.setValue(val);

            case 'Float':
                return normalizeFloatDefault(val);

            case 'Decimal':
                return normalizeDecimalDefault(val);

            case 'Boolean':
                return (ab) =>
                    ab.BooleanLiteral.setValue(val.toLowerCase() === 'true' || val === '1' || val === "b'1'");

            case 'String':
                if (val.toLowerCase() === 'uuid()') {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('uuid', services));
                }
                return (ab) => ab.StringLiteral.setValue(val);
            case 'Json':
                return (ab) => ab.StringLiteral.setValue(val);
            case 'Bytes':
                return (ab) => ab.StringLiteral.setValue(val);
        }

        // Handle function calls (e.g., uuid(), now())
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

        // Add @db.* attribute if the datatype differs from the default
        const dbAttr = services.shared.workspace.IndexManager.allElements('Attribute').find(
            (d) => d.name.toLowerCase() === `@db.${datatype.toLowerCase()}`,
        )?.node as Attribute | undefined;

        const defaultDatabaseType = this.getDefaultDatabaseType(fieldType as BuiltinType);

        if (
            dbAttr &&
            defaultDatabaseType &&
            (defaultDatabaseType.type !== datatype ||
                (defaultDatabaseType.precision && defaultDatabaseType.precision !== (length ?? precision)))
        ) {
            const dbAttrFactory = new DataFieldAttributeFactory().setDecl(dbAttr);
            const sizeValue = length ?? precision;
            if (sizeValue !== undefined && sizeValue !== null) {
                dbAttrFactory.addArg((a) => a.NumberLiteral.setValue(sizeValue));
            }
            factories.push(dbAttrFactory);
        }

        return factories;
    },
};
