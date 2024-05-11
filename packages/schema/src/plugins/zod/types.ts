import type { DMMF as PrismaDMMF } from '@zenstackhq/sdk/prisma';
import { Project } from 'ts-morph';

export type TransformerParams = {
    enumTypes?: readonly PrismaDMMF.SchemaEnum[];
    fields?: readonly PrismaDMMF.SchemaArg[];
    name?: string;
    models?: readonly PrismaDMMF.Model[];
    modelOperations?: PrismaDMMF.ModelMapping[];
    aggregateOperationSupport?: AggregateOperationSupport;
    isDefaultPrismaClientOutput?: boolean;
    prismaClientOutputPath?: string;
    project: Project;
    inputObjectTypes: PrismaDMMF.InputType[];
};

export type AggregateOperationSupport = {
    [model: string]: {
        count?: boolean;
        min?: boolean;
        max?: boolean;
        sum?: boolean;
        avg?: boolean;
    };
};
