import { DMMF as PrismaDMMF } from '@prisma/generator-helper';
import { Project } from 'ts-morph';

export type TransformerParams = {
    enumTypes?: PrismaDMMF.SchemaEnum[];
    fields?: PrismaDMMF.SchemaArg[];
    name?: string;
    models?: PrismaDMMF.Model[];
    modelOperations?: PrismaDMMF.ModelMapping[];
    aggregateOperationSupport?: AggregateOperationSupport;
    isDefaultPrismaClientOutput?: boolean;
    prismaClientOutputPath?: string;
    project: Project;
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
