import { upperCaseFirst } from '@zenstackhq/runtime/local-helpers';
import type { DMMF } from '../prisma';
import { AggregateOperationSupport } from './types';

const isAggregateOutputType = (name: string) => /(?:Count|Avg|Sum|Min|Max)AggregateOutputType$/.test(name);

export const isAggregateInputType = (name: string) =>
    name.endsWith('CountAggregateInput') ||
    name.endsWith('SumAggregateInput') ||
    name.endsWith('AvgAggregateInput') ||
    name.endsWith('MinAggregateInput') ||
    name.endsWith('MaxAggregateInput');

export function addMissingInputObjectTypesForAggregate(
    inputObjectTypes: DMMF.InputType[],
    outputObjectTypes: DMMF.OutputType[]
) {
    const aggregateOutputTypes = outputObjectTypes.filter(({ name }) => isAggregateOutputType(name));
    for (const aggregateOutputType of aggregateOutputTypes) {
        const name = aggregateOutputType.name.replace(/(?:OutputType|Output)$/, '');
        inputObjectTypes.push({
            constraints: { maxNumFields: null, minNumFields: null },
            name: `${upperCaseFirst(name)}Input`,
            fields: aggregateOutputType.fields.map((field) => ({
                name: field.name,
                isNullable: false,
                isRequired: false,
                inputTypes: [
                    {
                        isList: false,
                        type: 'True',
                        location: 'scalar',
                    },
                ],
            })),
        });
    }
}

export function resolveAggregateOperationSupport(inputObjectTypes: DMMF.InputType[]) {
    const aggregateOperationSupport: AggregateOperationSupport = {};
    for (const inputType of inputObjectTypes) {
        if (isAggregateInputType(inputType.name)) {
            const name = inputType.name.replace('AggregateInput', '');
            if (name.endsWith('Count')) {
                const model = name.replace('Count', '');
                aggregateOperationSupport[model] = {
                    ...aggregateOperationSupport[model],
                    count: true,
                };
            } else if (name.endsWith('Min')) {
                const model = name.replace('Min', '');
                aggregateOperationSupport[model] = {
                    ...aggregateOperationSupport[model],
                    min: true,
                };
            } else if (name.endsWith('Max')) {
                const model = name.replace('Max', '');
                aggregateOperationSupport[model] = {
                    ...aggregateOperationSupport[model],
                    max: true,
                };
            } else if (name.endsWith('Sum')) {
                const model = name.replace('Sum', '');
                aggregateOperationSupport[model] = {
                    ...aggregateOperationSupport[model],
                    sum: true,
                };
            } else if (name.endsWith('Avg')) {
                const model = name.replace('Avg', '');
                aggregateOperationSupport[model] = {
                    ...aggregateOperationSupport[model],
                    avg: true,
                };
            }
        }
    }
    return aggregateOperationSupport;
}
