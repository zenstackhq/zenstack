import type { Model } from '@zenstackhq/sdk/ast';
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
    zmodel: Model;
    mode: ObjectMode;
    zodVersion: 'v3' | 'v4';
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

export type ObjectMode = 'strict' | 'strip' | 'passthrough';
