import { DataModel, DataModelField } from './ast';

/**
 * Gets the name of the function that computes a partial Prisma query guard.
 */
export function getQueryGuardFunctionName(
    model: DataModel,
    forField: DataModelField | undefined,
    fieldOverride: boolean,
    kind: string
) {
    return `${model.name}${forField ? '$' + forField.name : ''}${fieldOverride ? '$override' : ''}_${kind}`;
}

/**
 * Gets the name of the function that checks an entity for access policy rules.
 */
export function getEntityCheckerFunctionName(
    model: DataModel,
    forField: DataModelField | undefined,
    fieldOverride: boolean,
    kind: string
) {
    return `$check_${model.name}${forField ? '$' + forField.name : ''}${fieldOverride ? '$override' : ''}_${kind}`;
}
