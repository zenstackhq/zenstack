import {
    ExpressionUtils,
    type EnumDef,
    type FieldDef,
    type ModelDef,
    type SchemaDef,
} from '@zenstackhq/schema';
import { foreignKeyName, indexName, uniqueIndexName } from './conventions';
import {
    SNAPSHOT_VERSION,
    type ColumnSnapshot,
    type EnumSnapshot,
    type ForeignKeySnapshot,
    type IndexSnapshot,
    type NativeTypeSnapshot,
    type Snapshot,
    type SnapshotDefault,
    type TableSnapshot,
} from './types';

type Provider = SchemaDef['provider']['type'];

/**
 * Builds a stable {@link Snapshot} from a compiled ZenStack schema.
 *
 * The physical mapping (table/column names, primary keys, unique constraints, foreign
 * keys) mirrors `SchemaDbPusher` in `@zenstackhq/orm` so that the migration engine and
 * the (test-only) schema pusher agree on the shape of the database.
 */
export function buildSnapshot(schema: SchemaDef): Snapshot {
    const enums: Record<string, EnumSnapshot> = {};
    for (const enumDef of Object.values(schema.enums ?? {})) {
        const name = mappedName(enumDef.attributes, '@@map') ?? enumDef.name;
        enums[name] = { name, values: enumValues(enumDef) };
    }

    const tables: Record<string, TableSnapshot> = {};
    for (const modelDef of Object.values(schema.models)) {
        if (modelDef.isView) {
            // views are not managed by the migration engine (yet)
            continue;
        }
        const table = buildTable(schema, modelDef);
        tables[table.name] = table;
    }

    return normalizeSnapshot({ version: SNAPSHOT_VERSION, provider: schema.provider.type, enums, tables });
}

/** An empty snapshot, used as the "before" state of the very first migration. */
export function emptySnapshot(provider: SchemaDef['provider']['type']): Snapshot {
    return { version: SNAPSHOT_VERSION, provider, enums: {}, tables: {} };
}

function buildTable(schema: SchemaDef, modelDef: ModelDef): TableSnapshot {
    const provider = schema.provider.type;
    const tableName = mappedName(modelDef.attributes, '@@map') ?? modelDef.name;

    const columns: Record<string, ColumnSnapshot> = {};
    const foreignKeys: ForeignKeySnapshot[] = [];

    for (const fieldDef of Object.values(modelDef.fields)) {
        if (fieldDef.originModel && !fieldDef.id) {
            // non-id field inherited from a base model lives on the base table
            continue;
        }
        if (fieldDef.type === 'Unsupported' || fieldDef.computed || isComputed(fieldDef)) {
            continue;
        }

        if (fieldDef.relation) {
            const fk = buildForeignKey(schema, modelDef, fieldDef, tableName, provider);
            if (fk) {
                foreignKeys.push(fk);
            }
            // relation navigation fields are not physical columns
            continue;
        }

        const column = buildColumn(schema, modelDef, fieldDef);
        columns[column.name] = column;
    }

    // delegate (polymorphic) inheritance: a sub-model's own table shares the base's primary
    // key, linked by a cascading foreign key from its id column(s) to the base's id column(s).
    const delegateFk = buildDelegateForeignKey(schema, modelDef, tableName, provider);
    if (delegateFk) {
        foreignKeys.push(delegateFk);
    }

    return {
        name: tableName,
        columns,
        primaryKey: buildPrimaryKey(modelDef),
        indexes: buildIndexes(modelDef, tableName, provider),
        foreignKeys,
    };
}

/** Builds the delegate foreign key linking a polymorphic sub-model's table to its base table. */
function buildDelegateForeignKey(
    schema: SchemaDef,
    modelDef: ModelDef,
    tableName: string,
    provider: Provider,
): ForeignKeySnapshot | undefined {
    if (!modelDef.baseModel) {
        return undefined;
    }
    const baseDef = schema.models[modelDef.baseModel];
    if (!baseDef) {
        return undefined;
    }
    const columns = modelDef.idFields.map((f) => columnName(modelDef.fields[f]!));
    const refColumns = baseDef.idFields.map((f) => columnName(baseDef.fields[f]!));
    return {
        name: foreignKeyName(provider, tableName, columns),
        columns,
        refTable: mappedName(baseDef.attributes, '@@map') ?? baseDef.name,
        refColumns,
        onDelete: 'Cascade',
        onUpdate: 'Cascade',
    };
}

function buildColumn(schema: SchemaDef, modelDef: ModelDef, fieldDef: FieldDef): ColumnSnapshot {
    const name = mappedName(fieldDef.attributes, '@map') ?? fieldDef.name;
    const isEnum = !!schema.enums?.[fieldDef.type];
    const isJson = fieldDef.type === 'Json' || isTypeDef(schema, fieldDef.type);
    const autoIncrement = isAutoIncrement(fieldDef);
    const singleId = !!fieldDef.id && modelDef.idFields.length === 1;

    return {
        name,
        type: fieldDef.type,
        isEnum,
        isJson,
        array: !!fieldDef.array,
        // arrays and optionals are nullable
        nullable: !!fieldDef.optional || !!fieldDef.array,
        default: extractDefault(fieldDef),
        autoIncrement,
        primaryKey: singleId,
        unique: !!fieldDef.unique,
        nativeType: extractNativeType(fieldDef),
    };
}

/** Extracts a Prisma-style native type attribute (`@db.*`) from a field, if present. */
function extractNativeType(fieldDef: FieldDef): NativeTypeSnapshot | undefined {
    const attr = fieldDef.attributes?.find((a) => a.name.startsWith('@db.'));
    if (!attr) {
        return undefined;
    }
    const name = attr.name.slice('@db.'.length);
    const args = (attr.args ?? [])
        .map((a) => ExpressionUtils.getLiteralValue(a.value))
        .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number');
    return { name, args };
}

function buildPrimaryKey(modelDef: ModelDef): string[] {
    // single field-level @id is represented on the column, not as a table constraint
    if (modelDef.idFields.length <= 1 && Object.values(modelDef.fields).some((f) => f.id)) {
        return [];
    }
    return modelDef.idFields.map((f) => columnName(modelDef.fields[f]!));
}

/**
 * Builds the index list for a model: unique indexes from `@unique`/`@@unique`
 * (via `uniqueFields`) and regular indexes from `@@index` (via model attributes).
 */
function buildIndexes(modelDef: ModelDef, tableName: string, provider: Provider): IndexSnapshot[] {
    const indexes: IndexSnapshot[] = [];
    const seen = new Set<string>();
    const add = (index: IndexSnapshot) => {
        const key = `${index.unique ? 'u' : 'i'}:${index.columns.join(',')}`;
        if (!seen.has(key)) {
            seen.add(key);
            indexes.push(index);
        }
    };

    // unique indexes (single-field `@unique` and compound `@@unique`)
    for (const [key, value] of Object.entries(modelDef.uniqueFields)) {
        let columns: string[];
        if ('type' in value) {
            const fieldDef = modelDef.fields[key];
            if (!fieldDef || fieldDef.id) {
                // `@id` is the primary key, not a unique index
                continue;
            }
            if (fieldDef.originModel && fieldDef.originModel !== modelDef.name) {
                continue;
            }
            columns = [columnName(fieldDef)];
        } else {
            const fields = Object.keys(value);
            if (fields.some((f) => modelDef.fields[f]?.originModel && modelDef.fields[f]!.originModel !== modelDef.name)) {
                continue;
            }
            columns = fields.map((f) => columnName(modelDef.fields[f]!));
        }
        add({ name: uniqueIndexName(provider, tableName, columns), columns, unique: true });
    }

    // regular indexes from `@@index([...], map?)`
    for (const attr of modelDef.attributes ?? []) {
        if (attr.name !== '@@index') {
            continue;
        }
        const columns = indexColumns(attr, modelDef);
        if (columns.length === 0) {
            continue;
        }
        add({ name: mappedIndexName(attr) ?? indexName(provider, tableName, columns), columns, unique: false });
    }

    return indexes;
}

/** Resolves the physical columns of an `@@index`/`@@unique` attribute. */
function indexColumns(attr: NonNullable<ModelDef['attributes']>[number], modelDef: ModelDef): string[] {
    const fieldsArg = attr.args?.find((a) => a.name === 'fields');
    const value = fieldsArg?.value as { items?: Array<{ kind: string; field?: string }> } | undefined;
    if (!value?.items) {
        return [];
    }
    const columns: string[] = [];
    for (const item of value.items) {
        if (item.kind === 'field' && item.field && modelDef.fields[item.field]) {
            columns.push(columnName(modelDef.fields[item.field]!));
        }
    }
    return columns;
}

/** Reads an explicit `map:` index name, if present. */
function mappedIndexName(attr: NonNullable<ModelDef['attributes']>[number]): string | undefined {
    const mapArg = attr.args?.find((a) => a.name === 'map');
    if (mapArg) {
        const value = ExpressionUtils.getLiteralValue(mapArg.value);
        if (typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}

function buildForeignKey(
    schema: SchemaDef,
    modelDef: ModelDef,
    fieldDef: FieldDef,
    tableName: string,
    provider: Provider,
): ForeignKeySnapshot | undefined {
    const relation = fieldDef.relation;
    if (!relation?.fields || !relation.references) {
        // not the owning side of the relation
        return undefined;
    }
    const targetModel = schema.models[fieldDef.type];
    if (!targetModel) {
        return undefined;
    }
    const columns = relation.fields.map((f) => columnName(modelDef.fields[f]!));
    return {
        name: foreignKeyName(provider, tableName, columns),
        columns,
        refTable: mappedName(targetModel.attributes, '@@map') ?? targetModel.name,
        refColumns: relation.references.map((f) => columnName(targetModel.fields[f]!)),
        onDelete: relation.onDelete ?? (fieldDef.optional ? 'SetNull' : 'Restrict'),
        onUpdate: relation.onUpdate ?? 'Cascade',
    };
}

// #region helpers

function columnName(fieldDef: FieldDef): string {
    return mappedName(fieldDef.attributes, '@map') ?? fieldDef.name;
}

function mappedName(attributes: ModelDef['attributes'], attrName: '@map' | '@@map'): string | undefined {
    const attr = attributes?.find((a) => a.name === attrName);
    if (attr?.args?.[0]) {
        const value = ExpressionUtils.getLiteralValue(attr.args[0].value);
        if (value && typeof value === 'string') {
            return value;
        }
    }
    return undefined;
}

function enumValues(enumDef: EnumDef): string[] {
    if (enumDef.fields) {
        return Object.values(enumDef.fields).map((f) => mappedName(f.attributes, '@map') ?? f.name);
    }
    return Object.values(enumDef.values);
}

function isComputed(fieldDef: FieldDef): boolean {
    return !!fieldDef.attributes?.some((a) => a.name === '@computed');
}

function isTypeDef(schema: SchemaDef, type: string): boolean {
    return !!schema.typeDefs && Object.values(schema.typeDefs).some((d) => d.name === type);
}

function isAutoIncrement(fieldDef: FieldDef): boolean {
    return (
        !!fieldDef.default &&
        typeof fieldDef.default === 'object' &&
        ExpressionUtils.isCall(fieldDef.default as any) &&
        (fieldDef.default as any).function === 'autoincrement'
    );
}

function extractDefault(fieldDef: FieldDef): SnapshotDefault | undefined {
    const def = fieldDef.default;
    if (def === undefined) {
        return undefined;
    }
    if (typeof def === 'object' && def !== null && 'kind' in def) {
        if (ExpressionUtils.isCall(def as any)) {
            const fn = (def as any).function as string;
            if (fn === 'now') {
                return { kind: 'now' };
            }
            if (fn === 'autoincrement') {
                return { kind: 'autoincrement' };
            }
            return { kind: 'call', function: fn };
        }
        if (ExpressionUtils.isLiteral(def as any)) {
            const value = ExpressionUtils.getLiteralValue(def as any);
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                return { kind: 'literal', value };
            }
        }
        return undefined;
    }
    if (typeof def === 'string' || typeof def === 'number' || typeof def === 'boolean') {
        return { kind: 'literal', value: def };
    }
    return undefined;
}

// #endregion

// #region stable serialization

/** Recursively sorts object keys so serialization is deterministic. */
function normalizeSnapshot(snapshot: Snapshot): Snapshot {
    return sortKeys(snapshot) as Snapshot;
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys);
    }
    if (value && typeof value === 'object') {
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>).sort()) {
            sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
        }
        return sorted;
    }
    return value;
}

/** Serializes a snapshot to stable, pretty-printed JSON. */
export function serializeSnapshot(snapshot: Snapshot): string {
    return JSON.stringify(normalizeSnapshot(snapshot), null, 4) + '\n';
}

/** Parses a snapshot from its JSON form. */
export function parseSnapshot(json: string): Snapshot {
    return normalizeSnapshot(JSON.parse(json) as Snapshot);
}

/** Whether two snapshots are structurally identical. */
export function snapshotsEqual(a: Snapshot, b: Snapshot): boolean {
    return serializeSnapshot(a) === serializeSnapshot(b);
}

// #endregion
