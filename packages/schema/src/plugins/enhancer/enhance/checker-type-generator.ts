import { getDataModels } from '@zenstackhq/sdk';
import type { DataModel, DataModelField, Model } from '@zenstackhq/sdk/ast';
import { lowerCaseFirst } from 'lower-case-first';
import { P, match } from 'ts-pattern';

/**
 * Generates a `ModelCheckers` interface that contains a `check` method for each model in the schema.
 *
 * E.g.:
 *
 * ```ts
 * type CheckerOperation = 'create' | 'read' | 'update' | 'delete';
 *
 * export interface ModelCheckers {
 *    user: { check(op: CheckerOperation, args?: { email?: string; age?: number; }): Promise<boolean> },
 *    ...
 * }
 * ```
 */
export function generateCheckerType(model: Model) {
    return `
type CheckerOperation = 'create' | 'read' | 'update' | 'delete';

export interface ModelCheckers {
    ${getDataModels(model)
        .map((dataModel) => `\t${lowerCaseFirst(dataModel.name)}: ${generateDataModelChecker(dataModel)}`)
        .join(',\n')}
}
`;
}

function generateDataModelChecker(dataModel: DataModel) {
    return `{
        check(op: CheckerOperation, args?: ${generateDataModelArgs(dataModel)}): Promise<boolean>
    }`;
}

function generateDataModelArgs(dataModel: DataModel) {
    return `{ ${dataModel.fields
        .filter((field) => isFieldFilterable(field))
        .map((field) => `${field.name}?: ${mapFieldType(field)}`)
        .join('; ')} }`;
}

function isFieldFilterable(field: DataModelField) {
    return !!mapFieldType(field);
}

function mapFieldType(field: DataModelField) {
    return match(field.type.type)
        .with('Boolean', () => 'boolean')
        .with(P.union('BigInt', 'Int', 'Float', 'Decimal'), () => 'number')
        .with('String', () => 'string')
        .otherwise(() => undefined);
}
