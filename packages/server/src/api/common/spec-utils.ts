import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import type { QueryOptions } from '@zenstackhq/orm';
import { ExpressionUtils, type AttributeApplication, type ModelDef, type SchemaDef } from '@zenstackhq/orm/schema';

export const DEFAULT_SPEC_TITLE = 'ZenStack Generated API';
export const DEFAULT_SPEC_VERSION = '1.0.0';

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

/**
 * Checks if an operation on a model may be denied by access policies.
 * Returns true when `respectAccessPolicies` is enabled and the model's policies
 * for the given operation are NOT a constant allow.
 */
export function mayDenyAccess(modelDef: ModelDef, operation: string, respectAccessPolicies?: boolean): boolean {
    if (!respectAccessPolicies) return false;

    const policyAttrs = (modelDef.attributes ?? []).filter(
        (attr) => attr.name === '@@allow' || attr.name === '@@deny',
    );

    // No policy rules at all means default-deny
    if (policyAttrs.length === 0) return true;

    const getArgByName = (args: AttributeApplication['args'], name: string) =>
        args?.find((a) => a.name === name)?.value;

    const matchesOperation = (args: AttributeApplication['args']) => {
        const val = getArgByName(args, 'operation');
        if (!val || val.kind !== 'literal' || typeof val.value !== 'string') return false;
        const ops = val.value.split(',').map((s) => s.trim());
        return ops.includes(operation) || ops.includes('all');
    };

    const hasEffectiveDeny = policyAttrs.some((attr) => {
        if (attr.name !== '@@deny' || !matchesOperation(attr.args)) return false;
        const condition = getArgByName(attr.args, 'condition');
        // @@deny('op', false) is a no-op — skip it
        return !(condition?.kind === 'literal' && condition.value === false);
    });
    if (hasEffectiveDeny) return true;

    const relevantAllow = policyAttrs.filter((attr) => attr.name === '@@allow' && matchesOperation(attr.args));

    const hasConstantAllow = relevantAllow.some((attr) => {
        const condition = getArgByName(attr.args, 'condition');
        return condition?.kind === 'literal' && condition.value === true;
    });

    return !hasConstantAllow;
}

/**
 * Extracts a "description" from `@@meta("description", "...")` or `@meta("description", "...")` attributes.
 */
export function getMetaDescription(attributes: readonly AttributeApplication[] | undefined): string | undefined {
    if (!attributes) return undefined;
    for (const attr of attributes) {
        if (attr.name !== '@meta' && attr.name !== '@@meta') continue;
        const nameArg = attr.args?.find((a) => a.name === 'name');
        if (!nameArg || ExpressionUtils.getLiteralValue(nameArg.value) !== 'description') continue;
        const valueArg = attr.args?.find((a) => a.name === 'value');
        if (valueArg) {
            return ExpressionUtils.getLiteralValue(valueArg.value) as string | undefined;
        }
    }
    return undefined;
}
