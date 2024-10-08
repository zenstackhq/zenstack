import { CodeBlockWriter, SourceFile } from 'ts-morph';
import { getProcedureTypeByOpName } from '../utils';
import { getPrismaOperationTypes } from '.';

export function generateRouterTypingImports(sourceFile: SourceFile, version: string) {
    sourceFile.addStatements([
        `import type { MaybeRefOrGetter, UnwrapRef } from 'vue';`,
        `import type { AsyncData, AsyncDataOptions } from 'nuxt/app';`,
        `import type { KeysOf, PickFrom } from './utils';`,
    ]);

    if (version === 'v10') {
        sourceFile.addStatements([`import type { AnyRouter } from '@trpc/server';`]);
    } else {
        sourceFile.addStatements([`import type { AnyTRPCRouter as AnyRouter } from '@trpc/server';`]);
    }
}

export function generateProcedureTyping(
    writer: CodeBlockWriter,
    opType: string,
    modelName: string,
    baseOpType: string,
    _version: string
) {
    const procType = getProcedureTypeByOpName(baseOpType);
    const { genericBase, argsType, argsOptional, resultType } = getPrismaOperationTypes(modelName, opType);
    const errorType = `TRPCClientErrorLike<AppRouter>`;
    const inputOptional = argsOptional ? '?' : '';

    writer.block(() => {
        if (procType === 'query') {
            writer.writeLine(`
                query: <T extends ${genericBase}>(input${inputOptional}: ${argsType}) => Promise<${resultType}>;
                useQuery: <T extends ${genericBase}, ResT = ${resultType}, DataE = ${errorType}, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input${inputOptional}: MaybeRefOrGetter<${argsType}>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
                    trpc?: TRPCRequestOptions;
                    queryKey?: string;
                    watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
                }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
                useLazyQuery: <T extends ${genericBase}, ResT = ${resultType}, DataE = ${errorType}, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input${inputOptional}: MaybeRefOrGetter<${argsType}>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
                    trpc?: TRPCRequestOptions;
                    queryKey?: string;
                    watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
                }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
                `);
        } else if (procType === 'mutation') {
            writer.writeLine(`
                mutate: <T extends ${genericBase}>(input${inputOptional}: ${argsType}) => Promise<${resultType}>;
                useMutation: <T extends ${genericBase}, ResT = ${resultType}, DataE = ${errorType}, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
                    trpc?: TRPCRequestOptions;
                }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
                    mutate: <T extends ${genericBase}, ResT = ${resultType}, DataE = ${errorType}, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input${inputOptional}: ${argsType}) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
                };
                `);
        }
    });
}
