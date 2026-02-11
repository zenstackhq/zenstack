import type { Attribute, BuiltinType } from '@zenstackhq/language/ast';
import { DataFieldAttributeFactory } from '@zenstackhq/language/factory';
import { getAttributeRef, getDbName, getFunctionRef, normalizeDecimalDefault, normalizeFloatDefault } from '../utils';
import type { IntrospectedEnum, IntrospectedSchema, IntrospectedTable, IntrospectionProvider } from './provider';
import { CliError } from '../../../cli-error';
import { resolveNameCasing } from '../casing';

// Note: We dynamically import mysql2 inside the async function to avoid
// requiring it at module load time for environments that don't use MySQL.

function normalizeGenerationExpression(typeDef: string): string {
    // MySQL may include character set introducers in generation expressions, e.g. `_utf8mb4' '`.
    // Strip them to produce a stable, cleaner expression for `Unsupported("...")`.
    // MySQL commonly returns generation expressions with SQL-style quote escaping (e.g. `\\'`),
    // which would become an invalid ZModel string after the code generator escapes quotes again.
    // Normalize it to raw quotes, letting the ZModel code generator re-escape appropriately.
    return (
        typeDef
            // Remove character set introducers, with or without escaped quotes.
            .replace(/_([0-9A-Za-z_]+)\\?'/g, "'")
            // Unescape SQL-style escaped single quotes in the expression.
            .replace(/\\'/g, "'")
    );
}

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
    async introspect(connectionString: string, options: { schemas: string[]; modelCasing: 'pascal' | 'camel' | 'snake' | 'none' }): Promise<IntrospectedSchema> {
        const mysql = await import('mysql2/promise');
        const connection = await mysql.createConnection(connectionString);

        try {
            // Extract database name from connection string
            const url = new URL(connectionString);
            const databaseName = url.pathname.replace('/', '');

            if (!databaseName) {
                throw new CliError('Database name not found in connection string');
            }

            // Introspect tables
            const [tableRows] = (await connection.execute(getTableIntrospectionQuery(), [databaseName])) as [
                IntrospectedTable[],
                unknown,
            ];
            const tables: IntrospectedTable[] = [];

            for (const row of tableRows) {
                const columns = typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns;
                const indexes = typeof row.indexes === 'string' ? JSON.parse(row.indexes) : row.indexes;

                // Sort columns by ordinal_position to preserve database column order
              const sortedColumns = (columns || [])
                .sort(
                  (a: { ordinal_position?: number }, b: { ordinal_position?: number }) =>
                    (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0)
                )
                .map((col: any) => {
                    // MySQL enum datatype_name is synthetic (TableName_ColumnName).
                    // Apply model casing so it matches the cased enum_type.
                    if (col.datatype === 'enum' && col.datatype_name) {
                        return { ...col, datatype_name: resolveNameCasing(options.modelCasing, col.datatype_name).name };
                    }
                    // Normalize generated column expressions for stable output.
                    if (col.computed && typeof col.datatype === 'string') {
                        return { ...col, datatype: normalizeGenerationExpression(col.datatype) };
                    }
                    return col;
                });

                // Filter out auto-generated FK indexes (MySQL creates these automatically)
                // Pattern: {Table}_{column}_fkey for single-column FK indexes
                const filteredIndexes = (indexes || []).filter(
                    (idx: { name: string; columns: { name: string }[] }) =>
                        !(idx.columns.length === 1 && idx.name === `${row.name}_${idx.columns[0]?.name}_fkey`)
                );

                tables.push({
                    schema: '', // MySQL doesn't support multi-schema
                    name: row.name,
                    type: row.type as 'table' | 'view',
                    definition: row.definition,
                    columns: sortedColumns,
                    indexes: filteredIndexes,
                });
            }

            // Introspect enums (MySQL stores enum values in column definitions)
            const [enumRows] = (await connection.execute(getEnumIntrospectionQuery(), [databaseName])) as [
                { table_name: string; column_name: string; column_type: string }[],
                unknown,
            ];

            const enums: IntrospectedEnum[] = enumRows.map((row) => {
                // Parse enum values from column_type like "enum('val1','val2','val3')"
                const values = parseEnumValues(row.column_type);
                // MySQL doesn't have standalone enum types; the name is entirely
                // synthetic (TableName_ColumnName). Apply model casing here so it
                // arrives already cased — there is no raw DB name to @@map back to.
                const syntheticName = `${row.table_name}_${row.column_name}`;
                const { name } = resolveNameCasing(options.modelCasing, syntheticName);
                return {
                    schema_name: '', // MySQL doesn't support multi-schema
                    enum_type: name,
                    values,
                };
            });

            return { tables, enums };
        } finally {
            await connection.end();
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
                if (/^CURRENT_TIMESTAMP(\(\d*\))?$/i.test(val) || val.toLowerCase() === 'current_timestamp()' || val.toLowerCase() === 'now()') {
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
                return (ab) => ab.BooleanLiteral.setValue(val.toLowerCase() === 'true' || val === '1' || val === "b'1'");

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

        console.warn(`Unsupported default value type: "${defaultValue}" for field type "${fieldType}". Skipping default value.`);
        return null;
    },

    getFieldAttributes({ fieldName, fieldType, datatype, length, precision, services }) {
        const factories: DataFieldAttributeFactory[] = [];

        // Add @updatedAt for DateTime fields named updatedAt or updated_at
        if (fieldType === 'DateTime' && (fieldName.toLowerCase() === 'updatedat' || fieldName.toLowerCase() === 'updated_at')) {
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
                (defaultDatabaseType.precision &&
                    defaultDatabaseType.precision !== (length ?? precision)))
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

function getTableIntrospectionQuery() {
    // Note: We use subqueries with ORDER BY before JSON_ARRAYAGG to ensure ordering
    // since MySQL < 8.0.21 doesn't support ORDER BY inside JSON_ARRAYAGG.
    // MySQL doesn't support multi-schema, so we don't include schema in the result.
    return `
-- Main query: one row per table/view with columns and indexes as nested JSON arrays.
-- Uses INFORMATION_SCHEMA which is MySQL's standard metadata catalog.
SELECT
    t.TABLE_NAME AS \`name\`,              -- table or view name
    CASE t.TABLE_TYPE                      -- map MySQL table type strings to our internal types
        WHEN 'BASE TABLE' THEN 'table'
        WHEN 'VIEW' THEN 'view'
        ELSE NULL
    END AS \`type\`,
    CASE                                   -- for views, retrieve the SQL definition
        WHEN t.TABLE_TYPE = 'VIEW' THEN v.VIEW_DEFINITION
        ELSE NULL
    END AS \`definition\`,

    -- ===== COLUMNS subquery =====
    -- Wraps an ordered subquery in JSON_ARRAYAGG to produce a JSON array of column objects.
    (
        SELECT JSON_ARRAYAGG(col_json)
        FROM (
            SELECT JSON_OBJECT(
                'ordinal_position', c.ORDINAL_POSITION,  -- column position (used for sorting)
                'name', c.COLUMN_NAME,                    -- column name

                -- datatype: for generated/computed columns, construct the full DDL-like type definition
                -- (e.g., "int GENERATED ALWAYS AS (col1 + col2) STORED") so it can be rendered as
                -- Unsupported("..."); special-case tinyint(1) as 'boolean' (MySQL's boolean convention);
                -- otherwise use the DATA_TYPE (e.g., 'int', 'varchar', 'datetime').
                'datatype', CASE
                    WHEN c.GENERATION_EXPRESSION IS NOT NULL AND c.GENERATION_EXPRESSION != '' THEN
                        CONCAT(
                            c.COLUMN_TYPE,
                            ' GENERATED ALWAYS AS (',
                            c.GENERATION_EXPRESSION,
                            ') ',
                            CASE
                                WHEN c.EXTRA LIKE '%STORED GENERATED%' THEN 'STORED'
                                ELSE 'VIRTUAL'
                            END
                        )
                    WHEN c.DATA_TYPE = 'tinyint' AND c.COLUMN_TYPE = 'tinyint(1)' THEN 'boolean'
                    ELSE c.DATA_TYPE
                END,

                -- datatype_name: for enum columns, generate a synthetic name "TableName_ColumnName"
                -- (MySQL doesn't have named enum types like PostgreSQL)
                'datatype_name', CASE
                    WHEN c.DATA_TYPE = 'enum' THEN CONCAT(t.TABLE_NAME, '_', c.COLUMN_NAME)
                    ELSE NULL
                END,

                'datatype_schema', '',                     -- MySQL doesn't support multi-schema
                'length', c.CHARACTER_MAXIMUM_LENGTH,      -- max length for string types (e.g., VARCHAR(255) -> 255)
                'precision', COALESCE(c.NUMERIC_PRECISION, c.DATETIME_PRECISION),  -- numeric or datetime precision

                'nullable', c.IS_NULLABLE = 'YES',         -- true if column allows NULL

                -- default: for auto_increment columns, report 'auto_increment' instead of NULL;
                -- otherwise use the COLUMN_DEFAULT value
                'default', CASE
                    WHEN c.EXTRA LIKE '%auto_increment%' THEN 'auto_increment'
                    ELSE c.COLUMN_DEFAULT
                END,

                'pk', c.COLUMN_KEY = 'PRI',                -- true if column is part of the primary key

                -- unique: true if the column has a single-column unique index.
                -- COLUMN_KEY = 'UNI' covers most cases, but may not be set when the column
                -- also participates in other indexes (showing 'MUL' instead on some MySQL versions).
                -- Also check INFORMATION_SCHEMA.STATISTICS for single-column unique indexes
                -- (NON_UNIQUE = 0) to match the PostgreSQL introspection behavior.
                'unique', (
                    c.COLUMN_KEY = 'UNI'
                    OR EXISTS (
                        SELECT 1
                        FROM INFORMATION_SCHEMA.STATISTICS s_uni
                        WHERE s_uni.TABLE_SCHEMA = c.TABLE_SCHEMA
                            AND s_uni.TABLE_NAME = c.TABLE_NAME
                            AND s_uni.COLUMN_NAME = c.COLUMN_NAME
                            AND s_uni.NON_UNIQUE = 0
                            AND s_uni.INDEX_NAME != 'PRIMARY'
                            AND (
                                SELECT COUNT(*)
                                FROM INFORMATION_SCHEMA.STATISTICS s_cnt
                                WHERE s_cnt.TABLE_SCHEMA = s_uni.TABLE_SCHEMA
                                    AND s_cnt.TABLE_NAME = s_uni.TABLE_NAME
                                    AND s_cnt.INDEX_NAME = s_uni.INDEX_NAME
                            ) = 1
                    )
                ),
                'unique_name', (
                    SELECT COALESCE(
                        CASE WHEN c.COLUMN_KEY = 'UNI' THEN c.COLUMN_NAME ELSE NULL END,
                        (
                            SELECT s_uni.INDEX_NAME
                            FROM INFORMATION_SCHEMA.STATISTICS s_uni
                            WHERE s_uni.TABLE_SCHEMA = c.TABLE_SCHEMA
                                AND s_uni.TABLE_NAME = c.TABLE_NAME
                                AND s_uni.COLUMN_NAME = c.COLUMN_NAME
                                AND s_uni.NON_UNIQUE = 0
                                AND s_uni.INDEX_NAME != 'PRIMARY'
                                AND (
                                    SELECT COUNT(*)
                                    FROM INFORMATION_SCHEMA.STATISTICS s_cnt
                                    WHERE s_cnt.TABLE_SCHEMA = s_uni.TABLE_SCHEMA
                                        AND s_cnt.TABLE_NAME = s_uni.TABLE_NAME
                                        AND s_cnt.INDEX_NAME = s_uni.INDEX_NAME
                                ) = 1
                            LIMIT 1
                        )
                    )
                ),

                -- computed: true if column has a generation expression (virtual or stored)
                'computed', c.GENERATION_EXPRESSION IS NOT NULL AND c.GENERATION_EXPRESSION != '',

                -- options: for enum columns, the full COLUMN_TYPE string (e.g., "enum('a','b','c')")
                -- which gets parsed into individual values later
                'options', CASE
                    WHEN c.DATA_TYPE = 'enum' THEN c.COLUMN_TYPE
                    ELSE NULL
                END,

                -- Foreign key info (NULL if column is not part of a FK)
                'foreign_key_schema', NULL,                 -- MySQL doesn't support cross-schema FKs here
                'foreign_key_table', kcu_fk.REFERENCED_TABLE_NAME,   -- referenced table
                'foreign_key_column', kcu_fk.REFERENCED_COLUMN_NAME, -- referenced column
                'foreign_key_name', kcu_fk.CONSTRAINT_NAME,          -- FK constraint name
                'foreign_key_on_update', rc.UPDATE_RULE,    -- referential action on update (CASCADE, SET NULL, etc.)
                'foreign_key_on_delete', rc.DELETE_RULE      -- referential action on delete
            ) AS col_json

            FROM INFORMATION_SCHEMA.COLUMNS c  -- one row per column in the database

            -- Join KEY_COLUMN_USAGE to find foreign key references for this column.
            -- Filter to only FK entries (REFERENCED_TABLE_NAME IS NOT NULL).
            LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu_fk
                ON c.TABLE_SCHEMA = kcu_fk.TABLE_SCHEMA
                AND c.TABLE_NAME = kcu_fk.TABLE_NAME
                AND c.COLUMN_NAME = kcu_fk.COLUMN_NAME
                AND kcu_fk.REFERENCED_TABLE_NAME IS NOT NULL

            -- Join REFERENTIAL_CONSTRAINTS to get ON UPDATE / ON DELETE rules for the FK.
            LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                ON kcu_fk.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
                AND kcu_fk.CONSTRAINT_NAME = rc.CONSTRAINT_NAME

            WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA
                AND c.TABLE_NAME = t.TABLE_NAME
            ORDER BY c.ORDINAL_POSITION        -- preserve original column order
        ) AS cols_ordered
    ) AS \`columns\`,

    -- ===== INDEXES subquery =====
    -- Aggregates all indexes for this table into a JSON array.
    (
        SELECT JSON_ARRAYAGG(idx_json)
        FROM (
            SELECT JSON_OBJECT(
                'name', s.INDEX_NAME,          -- index name (e.g., 'PRIMARY', 'idx_email')
                'method', s.INDEX_TYPE,         -- index type (e.g., 'BTREE', 'HASH', 'FULLTEXT')
                'unique', s.NON_UNIQUE = 0,    -- NON_UNIQUE=0 means it IS unique
                'primary', s.INDEX_NAME = 'PRIMARY',  -- MySQL names the PK index 'PRIMARY'
                'valid', TRUE,                  -- MySQL doesn't expose index validity status
                'ready', TRUE,                  -- MySQL doesn't expose index readiness status
                'partial', FALSE,               -- MySQL doesn't support partial indexes
                'predicate', NULL,              -- no WHERE clause on indexes in MySQL

                -- Index columns: nested subquery for columns in this index
                'columns', (
                    SELECT JSON_ARRAYAGG(idx_col_json)
                    FROM (
                        SELECT JSON_OBJECT(
                            'name', s2.COLUMN_NAME,           -- column name in the index
                            'expression', NULL,               -- MySQL doesn't expose expression indexes via STATISTICS
                            -- COLLATION: 'A' = ascending, 'D' = descending, NULL = not sorted
                            'order', CASE s2.COLLATION WHEN 'A' THEN 'ASC' WHEN 'D' THEN 'DESC' ELSE NULL END,
                            'nulls', NULL                     -- MySQL doesn't expose NULLS FIRST/LAST
                        ) AS idx_col_json
                        FROM INFORMATION_SCHEMA.STATISTICS s2  -- one row per column per index
                        WHERE s2.TABLE_SCHEMA = s.TABLE_SCHEMA
                            AND s2.TABLE_NAME = s.TABLE_NAME
                            AND s2.INDEX_NAME = s.INDEX_NAME
                        ORDER BY s2.SEQ_IN_INDEX              -- preserve column order within the index
                    ) AS idx_cols_ordered
                )
            ) AS idx_json
            FROM (
                -- Deduplicate: STATISTICS has one row per (index, column), but we need one row per index.
                -- DISTINCT on INDEX_NAME gives us one entry per index with its metadata.
                SELECT DISTINCT INDEX_NAME, INDEX_TYPE, NON_UNIQUE, TABLE_SCHEMA, TABLE_NAME
                FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = t.TABLE_SCHEMA AND TABLE_NAME = t.TABLE_NAME
            ) s
        ) AS idxs_ordered
    ) AS \`indexes\`

-- === Main FROM: INFORMATION_SCHEMA.TABLES lists all tables and views ===
FROM INFORMATION_SCHEMA.TABLES t
-- Join VIEWS to get VIEW_DEFINITION for view tables
LEFT JOIN INFORMATION_SCHEMA.VIEWS v
    ON t.TABLE_SCHEMA = v.TABLE_SCHEMA AND t.TABLE_NAME = v.TABLE_NAME
WHERE t.TABLE_SCHEMA = ?                              -- only the target database
    AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')        -- exclude system tables like SYSTEM VIEW
    AND t.TABLE_NAME <> '_prisma_migrations'           -- exclude Prisma migration tracking table
ORDER BY t.TABLE_NAME;
`;
}

function getEnumIntrospectionQuery() {
    // MySQL doesn't have standalone enum types like PostgreSQL's CREATE TYPE.
    // Instead, enum values are embedded in column definitions (e.g., COLUMN_TYPE = "enum('a','b','c')").
    // This query finds all enum columns so we can extract their allowed values.
    return `
SELECT
    c.TABLE_NAME AS table_name,    -- table containing the enum column
    c.COLUMN_NAME AS column_name,  -- column name
    c.COLUMN_TYPE AS column_type   -- full type string including values (e.g., "enum('val1','val2')")
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_SCHEMA = ?                   -- only the target database
    AND c.DATA_TYPE = 'enum'               -- only enum columns
ORDER BY c.TABLE_NAME, c.COLUMN_NAME;
`;
}

/**
 * Parse enum values from MySQL COLUMN_TYPE string like "enum('val1','val2','val3')"
 */
function parseEnumValues(columnType: string): string[] {
    // Match the content inside enum(...)
    const match = columnType.match(/^enum\((.+)\)$/i);
    if (!match || !match[1]) return [];

    const valuesString = match[1];
    const values: string[] = [];

    // Parse quoted values, handling escaped quotes
    let current = '';
    let inQuote = false;
    let i = 0;

    while (i < valuesString.length) {
        const char = valuesString[i];

        if (char === "'" && !inQuote) {
            inQuote = true;
            i++;
            continue;
        }

        if (char === "'" && inQuote) {
            // Check for escaped quote ('')
            if (valuesString[i + 1] === "'") {
                current += "'";
                i += 2;
                continue;
            }
            // End of value
            values.push(current);
            current = '';
            inQuote = false;
            i++;
            // Skip comma and any whitespace
            while (i < valuesString.length && (valuesString[i] === ',' || valuesString[i] === ' ')) {
                i++;
            }
            continue;
        }

        if (inQuote) {
            current += char;
        }
        i++;
    }

    return values;
}
