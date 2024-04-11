import type { DMMF } from '../types';

export type TransformerParams = {
    enumTypes?: DMMF.SchemaEnum[];
    fields?: DMMF.SchemaArg[];
    name?: string;
    models?: DMMF.Model[];
    modelOperations?: DMMF.ModelMapping[];
    aggregateOperationSupport?: AggregateOperationSupport;
    isDefaultPrismaClientOutput?: boolean;
    prismaClientOutputPath?: string;
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
