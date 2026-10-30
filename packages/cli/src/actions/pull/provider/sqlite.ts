import { DataFieldAttributeFactory } from '@zenstackhq/language/factory';
import { getAttributeRef, getDbName, getFunctionRef, normalizeDecimalDefault, normalizeFloatDefault } from '../utils';
import type { IntrospectionProvider } from './provider';

export const sqlite: IntrospectionProvider = {
    isSupportedFeature(feature) {
        switch (feature) {
            case 'Schema':
                // Multi-schema feature is not available for SQLite because it doesn't have
                // the same concept of schemas as namespaces (unlike PostgreSQL, CockroachDB, SQL Server).
                return false;
            case 'NativeEnum':
                // SQLite doesn't support native enum types
                return false;
            default:
                return false;
        }
    },
    getBuiltinType(type) {
        // Strip parenthesized constraints (e.g., VARCHAR(255) → varchar, DECIMAL(10,2) → decimal)
        const t = (type || '')
            .toLowerCase()
            .trim()
            .replace(/\(.*\)$/, '')
            .trim();
        // SQLite has no array types
        const isArray = false;

        // SQLite type affinity rules (https://www.sqlite.org/datatype3.html):
        // 1. If type contains "INT" → INTEGER affinity
        // 2. If type contains "CHAR", "CLOB", or "TEXT" → TEXT affinity
        // 3. If type contains "BLOB" or no type → BLOB affinity
        // 4. If type contains "REAL", "FLOA", or "DOUB" → REAL affinity
        // 5. Otherwise → NUMERIC affinity

        // Handle specific known types first for better mapping
        switch (t) {
            // INTEGER types (SQLite: INT, INTEGER, TINYINT, SMALLINT, MEDIUMINT, INT2, INT8)
            case 'integer':
            case 'int':
            case 'tinyint':
            case 'smallint':
            case 'mediumint':
            case 'int2':
            case 'int8':
                return { type: 'Int', isArray };

            // BIGINT - map to BigInt for large integers
            case 'bigint':
            case 'unsigned big int':
                return { type: 'BigInt', isArray };

            // TEXT types (SQLite: CHARACTER, VARCHAR, VARYING CHARACTER, NCHAR, NATIVE CHARACTER, NVARCHAR, TEXT, CLOB)
            case 'text':
            case 'varchar':
            case 'char':
            case 'character':
            case 'varying character':
            case 'nchar':
            case 'native character':
            case 'nvarchar':
            case 'clob':
                return { type: 'String', isArray };

            // BLOB type
            case 'blob':
                return { type: 'Bytes', isArray };

            // REAL types (SQLite: REAL, DOUBLE, DOUBLE PRECISION, FLOAT)
            case 'real':
            case 'float':
            case 'double':
            case 'double precision':
                return { type: 'Float', isArray };

            // NUMERIC types (SQLite: NUMERIC, DECIMAL)
            case 'numeric':
            case 'decimal':
                return { type: 'Decimal', isArray };

            // DateTime types
            case 'datetime':
            case 'date':
            case 'time':
            case 'timestamp':
                return { type: 'DateTime', isArray };

            // JSON types
            case 'json':
            case 'jsonb':
                return { type: 'Json', isArray };

            // Boolean types
            case 'boolean':
            case 'bool':
                return { type: 'Boolean', isArray };

            default: {
                // SQLite affinity rule #3: columns with no declared type have BLOB affinity
                if (!t) {
                    return { type: 'Bytes', isArray };
                }
                // Fallback: Use SQLite affinity rules for unknown types
                if (t.includes('int')) {
                    return { type: 'Int', isArray };
                }
                if (t.includes('char') || t.includes('clob') || t.includes('text')) {
                    return { type: 'String', isArray };
                }
                if (t.includes('blob')) {
                    return { type: 'Bytes', isArray };
                }
                if (t.includes('real') || t.includes('floa') || t.includes('doub')) {
                    return { type: 'Float', isArray };
                }
                // Default to Unsupported for truly unknown types
                return { type: 'Unsupported' as const, isArray };
            }
        }
    },

    getDefaultDatabaseType() {
        return undefined;
    },

    getDefaultValue({ defaultValue, fieldType, services, enums }) {
        // datatype and datatype_name not used for SQLite
        const val = defaultValue.trim();

        switch (fieldType) {
            case 'DateTime':
                if (val === 'CURRENT_TIMESTAMP' || val === 'now()') {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('now', services));
                }
                // Fallback to string literal for other DateTime defaults
                return (ab) => ab.StringLiteral.setValue(val);

            case 'Int':
            case 'BigInt':
                if (val === 'autoincrement') {
                    return (ab) => ab.InvocationExpr.setFunction(getFunctionRef('autoincrement', services));
                }
                return (ab) => ab.NumberLiteral.setValue(val);

            case 'Float':
                return normalizeFloatDefault(val);

            case 'Decimal':
                return normalizeDecimalDefault(val);

            case 'Boolean':
                return (ab) => ab.BooleanLiteral.setValue(val === 'true' || val === '1');
            case 'String':
                if (val.startsWith("'") && val.endsWith("'")) {
                    const strippedName = val.slice(1, -1);
                    const enumDef = enums.find((e) => e.fields.find((v) => getDbName(v) === strippedName));
                    if (enumDef) {
                        const enumField = enumDef.fields.find((v) => getDbName(v) === strippedName);
                        if (enumField) return (ab) => ab.ReferenceExpr.setTarget(enumField);
                    }
                    return (ab) => ab.StringLiteral.setValue(strippedName);
                }
                return (ab) => ab.StringLiteral.setValue(val);
            case 'Json':
                return (ab) => ab.StringLiteral.setValue(val);
            case 'Bytes':
                return (ab) => ab.StringLiteral.setValue(val);
        }

        console.warn(
            `Unsupported default value type: "${defaultValue}" for field type "${fieldType}". Skipping default value.`,
        );
        return null;
    },

    getFieldAttributes({ fieldName, fieldType, services }) {
        const factories: DataFieldAttributeFactory[] = [];

        // Add @updatedAt for DateTime fields named updatedAt or updated_at
        if (
            fieldType === 'DateTime' &&
            (fieldName.toLowerCase() === 'updatedat' || fieldName.toLowerCase() === 'updated_at')
        ) {
            factories.push(new DataFieldAttributeFactory().setDecl(getAttributeRef('@updatedAt', services)));
        }

        return factories;
    },
};
