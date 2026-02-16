import { invariant } from '@zenstackhq/common-helpers';
import {
    AliasNode,
    ColumnNode,
    ReferenceNode,
    TableNode,
    type Expression,
    type ExpressionBuilder,
    type OperationNode,
} from 'kysely';
import { match } from 'ts-pattern';
import { ExpressionUtils, type FieldDef, type GetModels, type ModelDef, type SchemaDef } from '../schema';
import { extractFields } from '../utils/object-utils';
import type { AggregateOperators } from './constants';
import { createInternalError } from './errors';

export function hasModel(schema: SchemaDef, model: string) {
    return Object.keys(schema.models)
        .map((k) => k.toLowerCase())
        .includes(model.toLowerCase());
}

export function getModel(schema: SchemaDef, model: string) {
    return Object.values(schema.models).find((m) => m.name.toLowerCase() === model.toLowerCase());
}

export function getTypeDef(schema: SchemaDef, type: string) {
    return schema.typeDefs?.[type];
}

export function requireModel(schema: SchemaDef, model: string) {
    const modelDef = getModel(schema, model);
    if (!modelDef) {
        throw createInternalError(`Model "${model}" not found in schema`, model);
    }
    return modelDef;
}

export function requireTypeDef(schema: SchemaDef, type: string) {
    const typeDef = getTypeDef(schema, type);
    if (!typeDef) {
        throw createInternalError(`Type "${type}" not found in schema`, type);
    }
    return typeDef;
}

export function getField(schema: SchemaDef, model: string, field: string) {
    const modelDef = getModel(schema, model);
    return modelDef?.fields[field];
}

export function requireField(schema: SchemaDef, modelOrType: string, field: string) {
    const modelDef = getModel(schema, modelOrType);
    if (modelDef) {
        if (!modelDef.fields[field]) {
            throw createInternalError(`Field "${field}" not found in model "${modelOrType}"`, modelOrType);
        } else {
            return modelDef.fields[field];
        }
    }
    const typeDef = getTypeDef(schema, modelOrType);
    if (typeDef) {
        if (!typeDef.fields[field]) {
            throw createInternalError(`Field "${field}" not found in type "${modelOrType}"`, modelOrType);
        } else {
            return typeDef.fields[field];
        }
    }
    throw createInternalError(`Model or type "${modelOrType}" not found in schema`, modelOrType);
}

/**
 * Gets all model fields, by default non-relation, non-computed, non-inherited fields only.
 */
export function getModelFields(
    schema: SchemaDef,
    model: string,
    options?: { relations?: boolean; computed?: boolean; inherited?: boolean },
) {
    const modelDef = requireModel(schema, model);
    return Object.values(modelDef.fields).filter((f) => {
        if (f.relation && !options?.relations) {
            return false;
        }
        if (f.computed && !options?.computed) {
            return false;
        }
        if (f.originModel && !options?.inherited) {
            return false;
        }
        return true;
    });
}

export function getIdFields<Schema extends SchemaDef>(schema: SchemaDef, model: GetModels<Schema>) {
    const modelDef = getModel(schema, model);
    return modelDef?.idFields;
}

export function requireIdFields(schema: SchemaDef, model: string) {
    const modelDef = requireModel(schema, model);
    const result = modelDef?.idFields;
    if (!result) {
        throw createInternalError(`Model "${model}" does not have ID field(s)`, model);
    }
    return result;
}

export function getRelationForeignKeyFieldPairs(schema: SchemaDef, model: string, relationField: string) {
    const fieldDef = requireField(schema, model, relationField);

    if (!fieldDef?.relation) {
        throw createInternalError(`Field "${relationField}" is not a relation`, model);
    }

    if (fieldDef.relation.fields) {
        if (!fieldDef.relation.references) {
            throw createInternalError(`Relation references not defined for field "${relationField}"`, model);
        }
        // this model owns the fk
        return {
            keyPairs: fieldDef.relation.fields.map((f, i) => ({
                fk: f,
                pk: fieldDef.relation!.references![i]!,
            })),
            ownedByModel: true,
        };
    } else {
        if (!fieldDef.relation.opposite) {
            throw createInternalError(`Opposite relation not defined for field "${relationField}"`, model);
        }

        const oppositeField = requireField(schema, fieldDef.type, fieldDef.relation.opposite);

        if (!oppositeField.relation) {
            throw createInternalError(`Field "${fieldDef.relation.opposite}" is not a relation`, model);
        }
        if (!oppositeField.relation.fields) {
            throw createInternalError(`Relation fields not defined for field "${relationField}"`, model);
        }
        if (!oppositeField.relation.references) {
            throw createInternalError(`Relation references not defined for field "${relationField}"`, model);
        }

        // the opposite model owns the fk
        return {
            keyPairs: oppositeField.relation.fields.map((f, i) => ({
                fk: f,
                pk: oppositeField.relation!.references![i]!,
            })),
            ownedByModel: false,
        };
    }
}

export function isScalarField(schema: SchemaDef, model: string, field: string): boolean {
    const fieldDef = getField(schema, model, field);
    return !fieldDef?.relation && !fieldDef?.foreignKeyFor;
}

export function isForeignKeyField(schema: SchemaDef, model: string, field: string): boolean {
    const fieldDef = getField(schema, model, field);
    return !!fieldDef?.foreignKeyFor;
}

export function isRelationField(schema: SchemaDef, model: string, field: string): boolean {
    const fieldDef = getField(schema, model, field);
    return !!fieldDef?.relation;
}

export function isInheritedField(schema: SchemaDef, model: string, field: string): boolean {
    const fieldDef = getField(schema, model, field);
    return !!fieldDef?.originModel;
}

export function getUniqueFields(schema: SchemaDef, model: string) {
    const modelDef = requireModel(schema, model);
    const result: Array<
        // single field unique
        | { name: string; def: FieldDef }
        // multi-field unique
        | { name: string; defs: Record<string, FieldDef> }
    > = [];
    for (const [key, value] of Object.entries(modelDef.uniqueFields)) {
        if (typeof value !== 'object') {
            throw createInternalError(`Invalid unique field definition for "${key}"`, model);
        }

        if (typeof value.type === 'string') {
            // singular unique field
            result.push({ name: key, def: requireField(schema, model, key) });
        } else {
            // compound unique field
            result.push({
                name: key,
                defs: Object.fromEntries(Object.keys(value).map((k) => [k, requireField(schema, model, k)])),
            });
        }
    }
    return result;
}

export function getIdValues(schema: SchemaDef, model: string, data: any): Record<string, any> {
    const idFields = getIdFields(schema, model);
    if (!idFields) {
        throw createInternalError(`ID fields not defined for model "${model}"`, model);
    }
    return idFields.reduce((acc, field) => ({ ...acc, [field]: data[field] }), {});
}

export function fieldHasDefaultValue(fieldDef: FieldDef) {
    return fieldDef.default !== undefined || fieldDef.updatedAt;
}

export function isEnum(schema: SchemaDef, type: string) {
    return !!schema.enums?.[type];
}

export function getEnum(schema: SchemaDef, type: string) {
    return schema.enums?.[type];
}

export function isTypeDef(schema: SchemaDef, type: string) {
    return !!schema.typeDefs?.[type];
}

export function buildJoinPairs(
    schema: SchemaDef,
    model: string,
    modelAlias: string,
    relationField: string,
    relationModelAlias: string,
): [string, string][] {
    const { keyPairs, ownedByModel } = getRelationForeignKeyFieldPairs(schema, model, relationField);

    return keyPairs.map(({ fk, pk }) => {
        if (ownedByModel) {
            // the parent model owns the fk
            return [`${relationModelAlias}.${pk}`, `${modelAlias}.${fk}`];
        } else {
            // the relation side owns the fk
            return [`${relationModelAlias}.${fk}`, `${modelAlias}.${pk}`];
        }
    });
}

export function makeDefaultOrderBy(schema: SchemaDef, model: string) {
    const idFields = requireIdFields(schema, model);
    return idFields.map((f) => ({ [f]: 'asc' }) as const);
}

export function getManyToManyRelation(schema: SchemaDef, model: string, field: string) {
    const fieldDef = requireField(schema, model, field);
    if (!fieldDef.array || !fieldDef.relation?.opposite) {
        return undefined;
    }

    // in case the m2m relation field is inherited from a delegate base, get the base model
    const realModel = fieldDef.originModel ?? model;

    const oppositeFieldDef = requireField(schema, fieldDef.type, fieldDef.relation.opposite);
    if (oppositeFieldDef.array) {
        // Prisma's convention for many-to-many relation:
        // - model are sorted alphabetically by name
        // - join table is named _<model1>To<model2>, unless an explicit name is provided by `@relation`
        // - foreign keys are named A and B (based on the order of the model)
        const sortedModelNames = [realModel, fieldDef.type].sort();

        let orderedFK: [string, string];
        if (realModel !== fieldDef.type) {
            // not a self-relation, model name's sort order determines fk order
            orderedFK = sortedModelNames[0] === realModel ? ['A', 'B'] : ['B', 'A'];
        } else {
            // for self-relations, since model names are identical, relation field name's
            // sort order determines fk order
            const sortedFieldNames = [field, oppositeFieldDef.name].sort();
            orderedFK = sortedFieldNames[0] === field ? ['A', 'B'] : ['B', 'A'];
        }

        const modelIdFields = requireIdFields(schema, realModel);
        invariant(modelIdFields.length === 1, 'Only single-field ID is supported for many-to-many relation');
        const otherIdFields = requireIdFields(schema, fieldDef.type);
        invariant(otherIdFields.length === 1, 'Only single-field ID is supported for many-to-many relation');

        return {
            parentFkName: orderedFK[0],
            parentPKName: modelIdFields[0]!,
            otherModel: fieldDef.type,
            otherField: fieldDef.relation.opposite,
            otherFkName: orderedFK[1],
            otherPKName: otherIdFields[0]!,
            joinTable: fieldDef.relation.name
                ? `_${fieldDef.relation.name}`
                : `_${sortedModelNames[0]}To${sortedModelNames[1]}`,
        };
    } else {
        return undefined;
    }
}

/**
 * Convert filter like `{ id1_id2: { id1: 1, id2: 1 } }` to `{ id1: 1, id2: 1 }`
 */
export function flattenCompoundUniqueFilters(schema: SchemaDef, model: string, filter: unknown) {
    if (typeof filter !== 'object' || !filter) {
        return filter;
    }

    const uniqueFields = getUniqueFields(schema, model);
    const compoundUniques = uniqueFields.filter((u) => 'defs' in u);
    if (compoundUniques.length === 0) {
        return filter;
    }

    const flattenedResult: any = {};
    const restFilter: any = {};

    for (const [key, value] of Object.entries(filter)) {
        if (compoundUniques.some(({ name }) => name === key)) {
            // flatten the compound field
            Object.assign(flattenedResult, value);
        } else {
            restFilter[key] = value;
        }
    }

    if (Object.keys(flattenedResult).length === 0) {
        // nothing flattened
        return filter;
    } else if (Object.keys(restFilter).length === 0) {
        // all flattened
        return flattenedResult;
    } else {
        const flattenedKeys = Object.keys(flattenedResult);
        const restKeys = Object.keys(restFilter);
        if (flattenedKeys.some((k) => restKeys.includes(k))) {
            // keys overlap, cannot merge directly, build an AND clause
            return {
                AND: [flattenedResult, restFilter],
            };
        } else {
            // safe to merge directly
            return { ...flattenedResult, ...restFilter };
        }
    }
}

export function ensureArray<T>(value: T | T[]): T[] {
    if (Array.isArray(value)) {
        return value;
    } else {
        return [value];
    }
}

export function extractIdFields(entity: any, schema: SchemaDef, model: string) {
    const idFields = requireIdFields(schema, model);
    return extractFields(entity, idFields);
}

export function getDiscriminatorField(schema: SchemaDef, model: string) {
    const modelDef = requireModel(schema, model);
    const delegateAttr = modelDef.attributes?.find((attr) => attr.name === '@@delegate');
    if (!delegateAttr) {
        return undefined;
    }
    const discriminator = delegateAttr.args?.find((arg) => arg.name === 'discriminator');
    if (!discriminator || !ExpressionUtils.isField(discriminator.value)) {
        throw createInternalError(`Discriminator field not defined for model "${model}"`, model);
    }
    return discriminator.value.field;
}

export function getDelegateDescendantModels(
    schema: SchemaDef,
    model: string,
    collected: Set<ModelDef> = new Set<ModelDef>(),
): ModelDef[] {
    const subModels = Object.values(schema.models).filter((m) => m.baseModel === model);
    subModels.forEach((def) => {
        if (!collected.has(def)) {
            collected.add(def);
            getDelegateDescendantModels(schema, def.name, collected);
        }
    });
    return [...collected];
}

export function aggregate(eb: ExpressionBuilder<any, any>, expr: Expression<any>, op: AggregateOperators) {
    return match(op)
        .with('_count', () => eb.fn.count(expr))
        .with('_sum', () => eb.fn.sum(expr))
        .with('_avg', () => eb.fn.avg(expr))
        .with('_min', () => eb.fn.min(expr))
        .with('_max', () => eb.fn.max(expr))
        .exhaustive();
}

/**
 * Strips alias from the node if it exists.
 */
export function stripAlias(node: OperationNode) {
    if (AliasNode.is(node)) {
        return { alias: node.alias, node: node.node };
    } else {
        return { alias: undefined, node };
    }
}

/**
 * Extracts model name from an OperationNode.
 */
export function extractModelName(node: OperationNode) {
    const { node: innerNode } = stripAlias(node);
    return TableNode.is(innerNode!) ? innerNode!.table.identifier.name : undefined;
}

/**
 * Extracts field name from an OperationNode.
 */
export function extractFieldName(node: OperationNode) {
    if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
        return node.column.column.name;
    } else if (ColumnNode.is(node)) {
        return node.column.name;
    } else {
        return undefined;
    }
}
