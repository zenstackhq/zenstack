import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import type { QueryOptions } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';

/**
 * Checks if a model is included based on slicing options.
 */
export function isModelIncluded(modelName: string, queryOptions?: QueryOptions<any>): boolean {
    const slicing = queryOptions?.slicing;
    if (!slicing) return true;

    const excluded = slicing.excludedModels as readonly string[] | undefined;
    if (excluded?.includes(modelName)) return false;

    const included = slicing.includedModels as readonly string[] | undefined;
    if (included && !included.includes(modelName)) return false;

    return true;
}

/**
 * Checks if a CRUD operation is included for a model based on slicing options.
 */
export function isOperationIncluded(modelName: string, op: string, queryOptions?: QueryOptions<any>): boolean {
    const slicing = queryOptions?.slicing;
    if (!slicing?.models) return true;

    const modelKey = lowerCaseFirst(modelName);
    const modelSlicing = (slicing.models as Record<string, any>)[modelKey] ?? (slicing.models as any).$all;
    if (!modelSlicing) return true;

    const excluded = modelSlicing.excludedOperations as readonly string[] | undefined;
    if (excluded?.includes(op)) return false;

    const included = modelSlicing.includedOperations as readonly string[] | undefined;
    if (included && !included.includes(op)) return false;

    return true;
}

/**
 * Checks if a procedure is included based on slicing options.
 */
export function isProcedureIncluded(procName: string, queryOptions?: QueryOptions<any>): boolean {
    const slicing = queryOptions?.slicing;
    if (!slicing) return true;

    const excluded = slicing.excludedProcedures as readonly string[] | undefined;
    if (excluded?.includes(procName)) return false;

    const included = slicing.includedProcedures as readonly string[] | undefined;
    if (included && !included.includes(procName)) return false;

    return true;
}

/**
 * Checks if a field should be omitted from the output schema based on queryOptions.omit.
 */
export function isFieldOmitted(modelName: string, fieldName: string, queryOptions?: QueryOptions<any>): boolean {
    const omit = queryOptions?.omit as Record<string, Record<string, boolean>> | undefined;
    return omit?.[modelName]?.[fieldName] === true;
}

/**
 * Returns the list of model names from the schema that pass the slicing filter.
 */
export function getIncludedModels(schema: SchemaDef, queryOptions?: QueryOptions<any>): string[] {
    return Object.keys(schema.models).filter((name) => isModelIncluded(name, queryOptions));
}

/**
 * Checks if a filter kind is allowed for a specific field based on slicing options.
 */
export function isFilterKindIncluded(
    modelName: string,
    fieldName: string,
    filterKind: string,
    queryOptions?: QueryOptions<any>,
): boolean {
    const slicing = queryOptions?.slicing;
    if (!slicing?.models) return true;

    const modelKey = lowerCaseFirst(modelName);
    const modelSlicing = (slicing.models as Record<string, any>)[modelKey] ?? (slicing.models as any).$all;
    if (!modelSlicing?.fields) return true;

    const fieldSlicing = modelSlicing.fields[fieldName] ?? modelSlicing.fields.$all;
    if (!fieldSlicing) return true;

    const excluded = fieldSlicing.excludedFilterKinds as readonly string[] | undefined;
    if (excluded?.includes(filterKind)) return false;

    const included = fieldSlicing.includedFilterKinds as readonly string[] | undefined;
    if (included && !included.includes(filterKind)) return false;

    return true;
}
