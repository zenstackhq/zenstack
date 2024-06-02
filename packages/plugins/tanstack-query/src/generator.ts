import {
    PluginError,
    PluginOptions,
    RUNTIME_PACKAGE,
    createProject,
    ensureEmptyDir,
    generateModelMeta,
    getDataModels,
    requireOption,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, DataModelFieldType, Model, isEnum } from '@zenstackhq/sdk/ast';
import { getPrismaClientImportSpec, supportCreateMany, type DMMF } from '@zenstackhq/sdk/prisma';
import { paramCase } from 'change-case';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import { P, match } from 'ts-pattern';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';

const supportedTargets = ['react', 'vue', 'svelte'];
type TargetFramework = (typeof supportedTargets)[number];
type TanStackVersion = 'v4' | 'v5';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    const project = createProject();
    const warnings: string[] = [];
    const models = getDataModels(model);

    const target = requireOption<string>(options, 'target', name);
    if (!supportedTargets.includes(target)) {
        throw new PluginError(name, `Unsupported target "${target}", supported values: ${supportedTargets.join(', ')}`);
    }

    const version = typeof options.version === 'string' ? options.version : 'v5';
    if (version !== 'v4' && version !== 'v5') {
        throw new PluginError(name, `Unsupported version "${version}": use "v4" or "v5"`);
    }

    let outDir = requireOption<string>(options, 'output', name);
    outDir = resolvePath(outDir, options);
    ensureEmptyDir(outDir);

    await generateModelMeta(project, models, {
        output: path.join(outDir, '__model_meta.ts'),
        generateAttributes: false,
    });

    generateIndex(project, outDir, models, target, version);

    models.forEach((dataModel) => {
        const mapping = dmmf.mappings.modelOperations.find((op) => op.model === dataModel.name);
        if (!mapping) {
            warnings.push(`Unable to find mapping for model ${dataModel.name}`);
            return;
        }
        generateModelHooks(target, version, project, outDir, dataModel, mapping, options);
    });

    await saveProject(project);
    return { warnings };
}

function generateQueryHook(
    target: TargetFramework,
    version: TanStackVersion,
    sf: SourceFile,
    model: string,
    operation: string,
    returnArray: boolean,
    optionalInput: boolean,
    overrideReturnType?: string,
    overrideInputType?: string,
    overrideTypeParameters?: string[],
    supportInfinite = false,
    supportOptimistic = false
) {
    const generateModes: ('' | 'Infinite' | 'Suspense' | 'SuspenseInfinite')[] = [''];
    if (supportInfinite) {
        generateModes.push('Infinite');
    }

    if (target === 'react' && version === 'v5') {
        // react-query v5 supports suspense query
        generateModes.push('Suspense');
        if (supportInfinite) {
            generateModes.push('SuspenseInfinite');
        }
    }

    for (const generateMode of generateModes) {
        const capOperation = upperCaseFirst(operation);

        const argsType = overrideInputType ?? `Prisma.${model}${capOperation}Args`;
        const inputType = makeQueryArgsType(target, argsType);

        const infinite = generateMode.includes('Infinite');
        const suspense = generateMode.includes('Suspense');
        const optimistic =
            supportOptimistic &&
            // infinite queries are not subject to optimistic updates
            !infinite;

        let defaultReturnType = `Prisma.${model}GetPayload<TArgs>`;
        if (optimistic) {
            defaultReturnType += '& { $optimistic?: boolean }';
        }
        if (returnArray) {
            defaultReturnType = `Array<${defaultReturnType}>`;
        }

        const returnType = overrideReturnType ?? defaultReturnType;
        const optionsType = makeQueryOptions(target, 'TQueryFnData', 'TData', infinite, suspense, version);

        const func = sf.addFunction({
            name: `use${generateMode}${capOperation}${model}`,
            typeParameters: overrideTypeParameters ?? [
                `TArgs extends ${argsType}`,
                `TQueryFnData = ${returnType} `,
                'TData = TQueryFnData',
                'TError = DefaultError',
            ],
            parameters: [
                {
                    name: optionalInput ? 'args?' : 'args',
                    type: inputType,
                },
                {
                    name: 'options?',
                    type: optionsType,
                },
            ],
            isExported: true,
        });

        if (version === 'v5' && infinite && ['react', 'svelte'].includes(target)) {
            // getNextPageParam option is required in v5
            func.addStatements([`options = options ?? { getNextPageParam: () => null };`]);
        }

        func.addStatements([
            makeGetContext(target),
            `return use${generateMode}ModelQuery<TQueryFnData, TData, TError>('${model}', \`\${endpoint}/${lowerCaseFirst(
                model
            )}/${operation}\`, args, options, fetch);`,
        ]);
    }
}

function generateMutationHook(
    target: TargetFramework,
    sf: SourceFile,
    model: string,
    operation: string,
    httpVerb: 'post' | 'put' | 'delete',
    checkReadBack: boolean,
    overrideReturnType?: string
) {
    const capOperation = upperCaseFirst(operation);

    const argsType = `Prisma.${model}${capOperation}Args`;
    const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
    let returnType = overrideReturnType ?? `CheckSelect<T, ${model}, Prisma.${model}GetPayload<T>>`;
    if (checkReadBack) {
        returnType = `(${returnType} | undefined )`;
    }
    const nonGenericOptionsType = `Omit<${makeMutationOptions(
        target,
        checkReadBack ? `(${overrideReturnType ?? model} | undefined)` : overrideReturnType ?? model,
        argsType
    )}, 'mutationFn'>`;
    const optionsType = `Omit<${makeMutationOptions(target, returnType, inputType)}, 'mutationFn'>`;

    const func = sf.addFunction({
        name: `use${capOperation}${model}`,
        isExported: true,
        parameters: [
            {
                name: 'options?',
                type: nonGenericOptionsType,
            },
        ],
    });

    // get endpoint from context
    func.addStatements([makeGetContext(target)]);

    func.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: `_mutation`,
                initializer: `
                    useModelMutation<${argsType}, DefaultError, ${
                    overrideReturnType ?? model
                }, ${checkReadBack}>('${model}', '${httpVerb.toUpperCase()}', \`\${endpoint}/${lowerCaseFirst(
                    model
                )}/${operation}\`, metadata, options, fetch, ${checkReadBack})
                `,
            },
        ],
    });

    switch (target) {
        case 'react':
        case 'vue':
            // override the mutateAsync function to return the correct type
            func.addVariableStatement({
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'mutation',
                        initializer: `{
                    ..._mutation,
                    mutateAsync: async <T extends ${argsType}>(
                        args: Prisma.SelectSubset<T, ${argsType}>,
                        options?: ${optionsType}
                      ) => {
                        return (await _mutation.mutateAsync(
                          args,
                          options as any
                        )) as ${returnType};
                    },
                }`,
                    },
                ],
            });
            break;

        case 'svelte':
            // svelte-query returns a store for mutations
            // here we override the mutateAsync function to return the correct type
            // and call `derived` to return a new reactive store
            func.addVariableStatement({
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'mutation',
                        initializer: `derived(_mutation, value => ({
                    ...value,
                    mutateAsync: async <T extends ${argsType}>(
                        args: Prisma.SelectSubset<T, ${argsType}>,
                        options?: ${optionsType}
                      ) => {
                        return (await value.mutateAsync(
                          args,
                          options as any
                        )) as ${returnType};
                    },
                }))`,
                    },
                ],
            });
            break;

        default:
            throw new PluginError(name, `Unsupported target "${target}"`);
    }

    func.addStatements('return mutation;');
}

function generateCheckHook(
    target: string,
    version: TanStackVersion,
    sf: SourceFile,
    model: DataModel,
    prismaImport: string
) {
    const mapFilterType = (type: DataModelFieldType) => {
        return match(type.type)
            .with(P.union('Int', 'BigInt'), () => 'number')
            .with('String', () => 'string')
            .with('Boolean', () => 'boolean')
            .otherwise(() => undefined);
    };

    const filterFields: Array<{ name: string; type: string }> = [];
    const enumsToImport = new Set<string>();

    // collect filterable fields and enums to import
    model.fields.forEach((f) => {
        if (isEnum(f.type.reference?.ref)) {
            enumsToImport.add(f.type.reference.$refText);
            filterFields.push({ name: f.name, type: f.type.reference.$refText });
        }

        const mappedType = mapFilterType(f.type);
        if (mappedType) {
            filterFields.push({ name: f.name, type: mappedType });
        }
    });

    if (enumsToImport.size > 0) {
        // import enums
        sf.addStatements(`import type { ${Array.from(enumsToImport).join(', ')} } from '${prismaImport}';`);
    }

    const whereType = `{ ${filterFields.map(({ name, type }) => `${name}?: ${type}`).join('; ')} }`;

    const func = sf.addFunction({
        name: `useCheck${model.name}`,
        isExported: true,
        typeParameters: ['TError = DefaultError'],
        parameters: [
            { name: 'args', type: `{ operation: PolicyCrudKind; where?: ${whereType}; }` },
            { name: 'options?', type: makeQueryOptions(target, 'boolean', 'boolean', false, false, version) },
        ],
    });

    func.addStatements([
        makeGetContext(target),
        `return useModelQuery<boolean, boolean, TError>('${model.name}', \`\${endpoint}/${lowerCaseFirst(
            model.name
        )}/check\`, args, options, fetch);`,
    ]);
}

function generateModelHooks(
    target: TargetFramework,
    version: TanStackVersion,
    project: Project,
    outDir: string,
    model: DataModel,
    mapping: DMMF.ModelMapping,
    options: PluginOptions
) {
    const modelNameCap = upperCaseFirst(model.name);
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(path.join(outDir, `${fileName}.ts`), undefined, { overwrite: true });

    sf.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(outDir, options);
    sf.addImportDeclaration({
        namedImports: ['Prisma', model.name],
        isTypeOnly: true,
        moduleSpecifier: prismaImport,
    });
    sf.addStatements(makeBaseImports(target, version));

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.create || (mapping as any).createOne) {
        generateMutationHook(target, sf, model.name, 'create', 'post', true);
    }

    // createMany
    if (mapping.createMany && supportCreateMany(model.$container)) {
        generateMutationHook(target, sf, model.name, 'createMany', 'post', false, 'Prisma.BatchPayload');
    }

    // findMany
    if (mapping.findMany) {
        // regular findMany
        generateQueryHook(
            target,
            version,
            sf,
            model.name,
            'findMany',
            true,
            true,
            undefined,
            undefined,
            undefined,
            true,
            true
        );
    }

    // findUnique
    if (mapping.findUnique) {
        generateQueryHook(
            target,
            version,
            sf,
            model.name,
            'findUnique',
            false,
            false,
            undefined,
            undefined,
            undefined,
            false,
            true
        );
    }

    // findFirst
    if (mapping.findFirst) {
        generateQueryHook(
            target,
            version,
            sf,
            model.name,
            'findFirst',
            false,
            true,
            undefined,
            undefined,
            undefined,
            false,
            true
        );
    }

    // update
    // update is somehow named "updateOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.update || (mapping as any).updateOne) {
        generateMutationHook(target, sf, model.name, 'update', 'put', true);
    }

    // updateMany
    if (mapping.updateMany) {
        generateMutationHook(target, sf, model.name, 'updateMany', 'put', false, 'Prisma.BatchPayload');
    }

    // upsert
    // upsert is somehow named "upsertOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.upsert || (mapping as any).upsertOne) {
        generateMutationHook(target, sf, model.name, 'upsert', 'post', true);
    }

    // del
    // delete is somehow named "deleteOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.delete || (mapping as any).deleteOne) {
        generateMutationHook(target, sf, model.name, 'delete', 'delete', true);
    }

    // deleteMany
    if (mapping.deleteMany) {
        generateMutationHook(target, sf, model.name, 'deleteMany', 'delete', false, 'Prisma.BatchPayload');
    }

    // aggregate
    if (mapping.aggregate) {
        generateQueryHook(
            target,
            version,
            sf,
            modelNameCap,
            'aggregate',
            false,
            false,
            `Prisma.Get${modelNameCap}AggregateType<TArgs>`
        );
    }

    // groupBy
    if (mapping.groupBy) {
        const useName = model.name;

        const returnType = `{} extends InputErrors ? 
        Array<PickEnumerable<Prisma.${modelNameCap}GroupByOutputType, TArgs['by']> &
          {
            [P in ((keyof TArgs) & (keyof Prisma.${modelNameCap}GroupByOutputType))]: P extends '_count'
              ? TArgs[P] extends boolean
                ? number
                : Prisma.GetScalarType<TArgs[P], Prisma.${modelNameCap}GroupByOutputType[P]>
              : Prisma.GetScalarType<TArgs[P], Prisma.${modelNameCap}GroupByOutputType[P]>
          }
        > : InputErrors`;

        const typeParameters = [
            `TArgs extends Prisma.${useName}GroupByArgs`,
            `HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<TArgs>>, Prisma.Extends<'take', Prisma.Keys<TArgs>>>`,
            `OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.${useName}GroupByArgs['orderBy'] }: { orderBy?: Prisma.${useName}GroupByArgs['orderBy'] },`,
            `OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<TArgs['orderBy']>>>`,
            `ByFields extends Prisma.MaybeTupleToUnion<TArgs['by']>`,
            `ByValid extends Prisma.Has<ByFields, OrderFields>`,
            `HavingFields extends Prisma.GetHavingFields<TArgs['having']>`,
            `HavingValid extends Prisma.Has<ByFields, HavingFields>`,
            `ByEmpty extends TArgs['by'] extends never[] ? Prisma.True : Prisma.False`,
            `InputErrors extends ByEmpty extends Prisma.True
            ? \`Error: "by" must not be empty.\`
            : HavingValid extends Prisma.False
            ? {
                [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                ? \`Error: Field "\${P}" used in "having" needs to be provided in "by".\`
                : [
                    Error,
                    'Field ',
                    P,
                    \` in "having" needs to be provided in "by"\`,
                    ]
            }[HavingFields]
            : 'take' extends Prisma.Keys<TArgs>
            ? 'orderBy' extends Prisma.Keys<TArgs>
            ? ByValid extends Prisma.True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                    ? never
                    : \`Error: Field "\${P}" in "orderBy" needs to be provided in "by"\`
                }[OrderFields]
            : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Prisma.Keys<TArgs>
            ? 'orderBy' extends Prisma.Keys<TArgs>
            ? ByValid extends Prisma.True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                    ? never
                    : \`Error: Field "\${P}" in "orderBy" needs to be provided in "by"\`
                }[OrderFields]
            : 'Error: If you provide "skip", you also need to provide "orderBy"'
            : ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : \`Error: Field "\${P}" in "orderBy" needs to be provided in "by"\`
            }[OrderFields]`,
            `TQueryFnData = ${returnType}`,
            `TData = TQueryFnData`,
            `TError = DefaultError`,
        ];

        generateQueryHook(
            target,
            version,
            sf,
            model.name,
            'groupBy',
            false,
            false,
            returnType,
            `Prisma.SubsetIntersection<TArgs, Prisma.${useName}GroupByArgs, OrderByArg> & InputErrors`,
            typeParameters
        );
    }

    // somehow dmmf doesn't contain "count" operation, so we unconditionally add it here
    {
        generateQueryHook(
            target,
            version,
            sf,
            model.name,
            'count',
            false,
            true,
            `TArgs extends { select: any; } ? TArgs['select'] extends true ? number : Prisma.GetScalarType<TArgs['select'], Prisma.${modelNameCap}CountAggregateOutputType> : number`
        );
    }

    {
        // extra `check` hook for ZenStack's permission checker API
        generateCheckHook(target, version, sf, model, prismaImport);
    }
}

function generateIndex(
    project: Project,
    outDir: string,
    models: DataModel[],
    target: string,
    version: TanStackVersion
) {
    const runtimeImportBase = makeRuntimeImportBase(version);
    const sf = project.createSourceFile(path.join(outDir, 'index.ts'), undefined, { overwrite: true });
    sf.addStatements(models.map((d) => `export * from './${paramCase(d.name)}';`));
    sf.addStatements(`export { getQueryKey } from '${runtimeImportBase}';`);
    switch (target) {
        case 'react':
            sf.addStatements(`export { Provider } from '${runtimeImportBase}/react';`);
            break;
        case 'vue':
            sf.addStatements(`export { VueQueryContextKey, provideHooksContext } from '${runtimeImportBase}/vue';`);
            break;
        case 'svelte':
            sf.addStatements(`export { SvelteQueryContextKey, setHooksContext } from '${runtimeImportBase}/svelte';`);
            break;
    }
}

function makeGetContext(target: TargetFramework) {
    switch (target) {
        case 'react':
            return 'const { endpoint, fetch } = getHooksContext();';
        case 'vue':
            return 'const { endpoint, fetch } = getHooksContext();';
        case 'svelte':
            return `const { endpoint, fetch } = getHooksContext();`;
        default:
            throw new PluginError(name, `Unsupported target "${target}"`);
    }
}

function makeBaseImports(target: TargetFramework, version: TanStackVersion) {
    const runtimeImportBase = makeRuntimeImportBase(version);
    const shared = [
        `import { useModelQuery, useInfiniteModelQuery, useModelMutation } from '${runtimeImportBase}/${target}';`,
        `import type { PickEnumerable, CheckSelect, QueryError, ExtraQueryOptions, ExtraMutationOptions } from '${runtimeImportBase}';`,
        `import type { PolicyCrudKind } from '${RUNTIME_PACKAGE}'`,
        `import metadata from './__model_meta';`,
        `type DefaultError = QueryError;`,
    ];
    switch (target) {
        case 'react': {
            const suspense =
                version === 'v5'
                    ? [
                          `import { useSuspenseModelQuery, useSuspenseInfiniteModelQuery } from '${runtimeImportBase}/${target}';`,
                          `import type { UseSuspenseQueryOptions, UseSuspenseInfiniteQueryOptions } from '@tanstack/react-query';`,
                      ]
                    : [];
            return [
                `import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/react-query';`,
                `import { getHooksContext } from '${runtimeImportBase}/${target}';`,
                ...shared,
                ...suspense,
            ];
        }
        case 'vue': {
            return [
                `import type { UseMutationOptions, UseQueryOptions, UseInfiniteQueryOptions, InfiniteData } from '@tanstack/vue-query';`,
                `import { getHooksContext } from '${runtimeImportBase}/${target}';`,
                `import type { MaybeRefOrGetter, ComputedRef } from 'vue';`,
                ...shared,
            ];
        }
        case 'svelte': {
            return [
                `import { derived } from 'svelte/store';`,
                `import type { MutationOptions, CreateQueryOptions, CreateInfiniteQueryOptions } from '@tanstack/svelte-query';`,
                ...(version === 'v5'
                    ? [`import type { InfiniteData, StoreOrVal } from '@tanstack/svelte-query';`]
                    : []),
                `import { getHooksContext } from '${runtimeImportBase}/${target}';`,
                ...shared,
            ];
        }
        default:
            throw new PluginError(name, `Unsupported target: ${target}`);
    }
}

function makeQueryArgsType(target: string, argsType: string) {
    const type = `Prisma.SelectSubset<TArgs, ${argsType}>`;
    if (target === 'vue') {
        return `MaybeRefOrGetter<${type}> | ComputedRef<${type}>`;
    } else {
        return type;
    }
}

function makeQueryOptions(
    target: string,
    returnType: string,
    dataType: string,
    infinite: boolean,
    suspense: boolean,
    version: TanStackVersion
) {
    let result = match(target)
        .with('react', () =>
            infinite
                ? version === 'v4'
                    ? `Omit<UseInfiniteQueryOptions<${returnType}, TError, ${dataType}>, 'queryKey'>`
                    : `Omit<Use${
                          suspense ? 'Suspense' : ''
                      }InfiniteQueryOptions<${returnType}, TError, InfiniteData<${dataType}>>, 'queryKey' | 'initialPageParam'>`
                : `Omit<Use${suspense ? 'Suspense' : ''}QueryOptions<${returnType}, TError, ${dataType}>, 'queryKey'>`
        )
        .with('vue', () => {
            const baseOption = infinite
                ? `Omit<UseInfiniteQueryOptions<${returnType}, TError, InfiniteData<${dataType}>>, 'queryKey' | 'initialPageParam'>`
                : `Omit<UseQueryOptions<${returnType}, TError, ${dataType}>, 'queryKey'>`;
            return `MaybeRefOrGetter<${baseOption}> | ComputedRef<${baseOption}>`;
        })
        .with('svelte', () =>
            infinite
                ? version === 'v4'
                    ? `Omit<CreateInfiniteQueryOptions<${returnType}, TError, ${dataType}>, 'queryKey'>`
                    : `StoreOrVal<Omit<CreateInfiniteQueryOptions<${returnType}, TError, InfiniteData<${dataType}>>, 'queryKey' | 'initialPageParam'>>`
                : version === 'v4'
                ? `Omit<CreateQueryOptions<${returnType}, TError, ${dataType}>, 'queryKey'>`
                : `StoreOrVal<Omit<CreateQueryOptions<${returnType}, TError, ${dataType}>, 'queryKey'>>`
        )
        .otherwise(() => {
            throw new PluginError(name, `Unsupported target: ${target}`);
        });

    if (!infinite) {
        // non-infinite queries support extra options like optimistic updates
        result = `(${result} & ExtraQueryOptions)`;
    }

    return result;
}

function makeMutationOptions(target: string, returnType: string, argsType: string) {
    let result = match(target)
        .with('react', () => `UseMutationOptions<${returnType}, DefaultError, ${argsType}>`)
        .with('vue', () => {
            const baseOption = `UseMutationOptions<${returnType}, DefaultError, ${argsType}, unknown>`;
            return `MaybeRefOrGetter<${baseOption}> | ComputedRef<${baseOption}>`;
        })
        .with('svelte', () => `MutationOptions<${returnType}, DefaultError, ${argsType}>`)
        .otherwise(() => {
            throw new PluginError(name, `Unsupported target: ${target}`);
        });

    result = `(${result} & ExtraMutationOptions)`;

    return result;
}

function makeRuntimeImportBase(version: TanStackVersion) {
    return `@zenstackhq/tanstack-query/runtime${version === 'v5' ? '-v5' : ''}`;
}
