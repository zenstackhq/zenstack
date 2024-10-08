import { CodeBlockWriter, SourceFile } from 'ts-morph';
import { getProcedureTypeByOpName } from '../utils';
import { getPrismaOperationTypes } from '.';

export function generateRouterTypingImports(sourceFile: SourceFile, version: string) {
    sourceFile.addStatements([
        `import type { UseTRPCMutationOptions, UseTRPCMutationResult, UseTRPCQueryOptions, UseTRPCQueryResult, UseTRPCInfiniteQueryOptions, UseTRPCInfiniteQueryResult } from '@trpc/react-query/shared';`,
    ]);
    if (version === 'v10') {
        sourceFile.addStatements([`import type { AnyRouter } from '@trpc/server';`]);
    } else {
        sourceFile.addStatements([
            `import type { AnyTRPCRouter as AnyRouter } from '@trpc/server';`,
            `import type { UseTRPCSuspenseQueryOptions, UseTRPCSuspenseQueryResult, UseTRPCSuspenseInfiniteQueryOptions, UseTRPCSuspenseInfiniteQueryResult } from '@trpc/react-query/shared';`,
        ]);
    }
}

export function generateProcedureTyping(
    writer: CodeBlockWriter,
    opType: string,
    modelName: string,
    baseOpType: string,
    version: string
) {
    const procType = getProcedureTypeByOpName(baseOpType);
    const { genericBase, argsType, argsOptional, resultType } = getPrismaOperationTypes(modelName, opType);
    const errorType = `TRPCClientErrorLike<AppRouter>`;
    const inputOptional = argsOptional ? '?' : '';

    writer.block(() => {
        if (procType === 'query') {
            if (version === 'v10') {
                writer.writeLine(`
                useQuery: <T extends ${genericBase}, TData = ${resultType}>(
                    input${inputOptional}: ${argsType},
                    opts?: UseTRPCQueryOptions<string, T, ${resultType}, TData, Error>
                    ) => UseTRPCQueryResult<
                        TData,
                        ${errorType}
                    >;
                useInfiniteQuery: <T extends ${genericBase}>(
                    input${inputOptional}: Omit<${argsType}, 'cursor'>,
                    opts?: UseTRPCInfiniteQueryOptions<string, T, ${resultType}, Error>
                    ) => UseTRPCInfiniteQueryResult<
                        ${resultType},
                        ${errorType}
                    >;
                `);
            } else {
                writer.writeLine(`
                useQuery: <T extends ${genericBase}, TData = ${resultType}>(
                    input${inputOptional}: ${argsType},
                    opts?: UseTRPCQueryOptions<${resultType}, TData, Error>
                    ) => UseTRPCQueryResult<
                        TData,
                        ${errorType}
                    >;
                useInfiniteQuery: <T extends ${genericBase}>(
                    input${inputOptional}: Omit<${argsType}, 'cursor'>,
                    opts?: UseTRPCInfiniteQueryOptions<T, ${resultType}, Error>
                    ) => UseTRPCInfiniteQueryResult<
                        ${resultType},
                        ${errorType},
                        T
                    >;
                useSuspenseQuery: <T extends ${genericBase}, TData = ${resultType}>(
                    input${inputOptional}: ${argsType},
                    opts?: UseTRPCSuspenseQueryOptions<${resultType}, TData, Error>
                    ) => UseTRPCSuspenseQueryResult<TData, ${errorType}>;
                useSuspenseInfiniteQuery: <T extends ${genericBase}>(
                    input${inputOptional}: Omit<${argsType}, 'cursor'>,
                    opts?: UseTRPCSuspenseInfiniteQueryOptions<T, ${resultType}, Error>
                    ) => UseTRPCSuspenseInfiniteQueryResult<${resultType}, ${errorType}, T>;
                `);
            }
        } else if (procType === 'mutation') {
            writer.writeLine(`
                useMutation: <T extends ${genericBase}>(opts?: UseTRPCMutationOptions<
                    ${genericBase},
                    ${errorType},
                    ${resultType},
                    Context
                >) =>
                Omit<UseTRPCMutationResult<${resultType}, ${errorType}, ${argsType}, Context>, 'mutateAsync'> & {
                    mutateAsync:
                        <T extends ${genericBase}>(variables${inputOptional}: T, opts?: UseTRPCMutationOptions<T, ${errorType}, ${resultType}, Context>) => Promise<${resultType}>
                };
                `);
        }
    });
}
