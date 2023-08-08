import type { DMMF } from '@prisma/generator-helper';
import {
    PluginError,
    PluginOptions,
    createProject,
    getDataModels,
    getPrismaClientImportSpec,
    requireOption,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, Model } from '@zenstackhq/sdk/ast';
import { paramCase } from 'change-case';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';

const supportedTargets = ['react', 'svelte'];
type TargetFramework = (typeof supportedTargets)[number];

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output');
    outDir = resolvePath(outDir, options);

    const project = createProject();
    const warnings: string[] = [];
    const models = getDataModels(model);

    const target = requireOption<string>(options, 'target');
    if (!supportedTargets.includes(target)) {
        throw new PluginError(
            options.name,
            `Unsupported target "${target}", supported values: ${supportedTargets.join(', ')}`
        );
    }

    generateIndex(project, outDir, models, target);

    models.forEach((dataModel) => {
        const mapping = dmmf.mappings.modelOperations.find((op) => op.model === dataModel.name);
        if (!mapping) {
            warnings.push(`Unable to find mapping for model ${dataModel.name}`);
            return;
        }
        generateModelHooks(target, project, outDir, dataModel, mapping);
    });

    await saveProject(project);
    return warnings;
}

function generateQueryHook(
    target: TargetFramework,
    sf: SourceFile,
    model: string,
    operation: string,
    returnArray: boolean,
    optionalInput: boolean,
    overrideReturnType?: string,
    overrideInputType?: string,
    overrideTypeParameters?: string[]
) {
    const capOperation = upperCaseFirst(operation);

    const argsType = overrideInputType ?? `Prisma.${model}${capOperation}Args`;
    const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
    const returnType =
        overrideReturnType ?? (returnArray ? `Array<Prisma.${model}GetPayload<T>>` : `Prisma.${model}GetPayload<T>`);
    const optionsType = makeQueryOptions(target, returnType);

    const func = sf.addFunction({
        name: `use${capOperation}${model}`,
        typeParameters: overrideTypeParameters ?? [`T extends ${argsType}`],
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

    func.addStatements([
        makeGetContext(target),
        `return query<${returnType}>('${model}', \`\${endpoint}/${lowerCaseFirst(
            model
        )}/${operation}\`, args, options, fetch);`,
    ]);
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
            {
                name: 'invalidateQueries',
                type: 'boolean',
                initializer: 'true',
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
                    ${httpVerb}Mutation<${argsType}, ${
                    overrideReturnType ?? model
                }, ${checkReadBack}>('${model}', \`\${endpoint}/${lowerCaseFirst(
                    model
                )}/${operation}\`, options, fetch, invalidateQueries, ${checkReadBack})
                `,
            },
        ],
    });

    switch (target) {
        case 'react':
            // override the mutateAsync function to return the correct type
            func.addVariableStatement({
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'mutation',
                        initializer: `{
                    ..._mutation,
                    async mutateAsync<T extends ${argsType}>(
                        args: Prisma.SelectSubset<T, ${argsType}>,
                        options?: ${optionsType}
                      ) {
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
                    async mutateAsync<T extends ${argsType}>(
                        args: Prisma.SelectSubset<T, ${argsType}>,
                        options?: ${optionsType}
                      ) {
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

function generateModelHooks(
    target: TargetFramework,
    project: Project,
    outDir: string,
    model: DataModel,
    mapping: DMMF.ModelMapping
) {
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(path.join(outDir, `${fileName}.ts`), undefined, { overwrite: true });

    sf.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(model.$container, outDir);
    sf.addImportDeclaration({
        namedImports: ['Prisma', model.name],
        isTypeOnly: true,
        moduleSpecifier: prismaImport,
    });
    sf.addStatements(makeBaseImports(target));

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.create || (mapping as any).createOne) {
        generateMutationHook(target, sf, model.name, 'create', 'post', true);
    }

    // createMany
    if (mapping.createMany) {
        generateMutationHook(target, sf, model.name, 'createMany', 'post', false, 'Prisma.BatchPayload');
    }

    // findMany
    if (mapping.findMany) {
        generateQueryHook(target, sf, model.name, 'findMany', true, true);
    }

    // findUnique
    if (mapping.findUnique) {
        generateQueryHook(target, sf, model.name, 'findUnique', false, false);
    }

    // findFirst
    if (mapping.findFirst) {
        generateQueryHook(target, sf, model.name, 'findFirst', false, true);
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
        generateQueryHook(target, sf, model.name, 'aggregate', false, false, `Prisma.Get${model.name}AggregateType<T>`);
    }

    // groupBy
    if (mapping.groupBy) {
        const typeParameters = [
            `T extends Prisma.${model.name}GroupByArgs`,
            `HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>`,
            `OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.${model.name}GroupByArgs['orderBy'] }: { orderBy?: Prisma.${model.name}GroupByArgs['orderBy'] },`,
            `OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>`,
            `ByFields extends Prisma.MaybeTupleToUnion<T['by']>`,
            `ByValid extends Prisma.Has<ByFields, OrderFields>`,
            `HavingFields extends Prisma.GetHavingFields<T['having']>`,
            `HavingValid extends Prisma.Has<ByFields, HavingFields>`,
            `ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False`,
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
            : 'take' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
                ? {}
                : {
                    [P in OrderFields]: P extends ByFields
                    ? never
                    : \`Error: Field "\${P}" in "orderBy" needs to be provided in "by"\`
                }[OrderFields]
            : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
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
        ];

        const returnType = `{} extends InputErrors ? 
        Array<PickEnumerable<Prisma.${model.name}GroupByOutputType, T['by']> &
          {
            [P in ((keyof T) & (keyof Prisma.${model.name}GroupByOutputType))]: P extends '_count'
              ? T[P] extends boolean
                ? number
                : Prisma.GetScalarType<T[P], Prisma.${model.name}GroupByOutputType[P]>
              : Prisma.GetScalarType<T[P], Prisma.${model.name}GroupByOutputType[P]>
          }
        > : InputErrors`;

        generateQueryHook(
            target,
            sf,
            model.name,
            'groupBy',
            false,
            false,
            returnType,
            `Prisma.SubsetIntersection<T, Prisma.${model.name}GroupByArgs, OrderByArg> & InputErrors`,
            typeParameters
        );
    }

    // somehow dmmf doesn't contain "count" operation, so we unconditionally add it here
    {
        generateQueryHook(
            target,
            sf,
            model.name,
            'count',
            false,
            true,
            `T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.${model.name}CountAggregateOutputType> : number`
        );
    }
}

function generateIndex(project: Project, outDir: string, models: DataModel[], target: string) {
    const sf = project.createSourceFile(path.join(outDir, 'index.ts'), undefined, { overwrite: true });
    sf.addStatements(models.map((d) => `export * from './${paramCase(d.name)}';`));
    switch (target) {
        case 'react':
            sf.addStatements(`export { Provider } from '@zenstackhq/tanstack-query/runtime/react';`);
            break;
        case 'svelte':
            sf.addStatements(`export { SvelteQueryContextKey } from '@zenstackhq/tanstack-query/runtime/svelte';`);
            break;
    }
}

function makeGetContext(target: TargetFramework) {
    switch (target) {
        case 'react':
            return 'const { endpoint, fetch } = useContext(RequestHandlerContext);';
        case 'svelte':
            return `const { endpoint, fetch } = getContext<RequestHandlerContext>(SvelteQueryContextKey);`;
        default:
            throw new PluginError(name, `Unsupported target "${target}"`);
    }
}

function makeBaseImports(target: TargetFramework) {
    const shared = [
        `import { query, postMutation, putMutation, deleteMutation } from '@zenstackhq/tanstack-query/runtime/${target}';`,
        `import type { PickEnumerable, CheckSelect } from '@zenstackhq/tanstack-query/runtime';`,
    ];
    switch (target) {
        case 'react':
            return [
                `import { useContext } from 'react';`,
                `import type { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';`,
                `import { RequestHandlerContext } from '@zenstackhq/tanstack-query/runtime/${target}';`,
                ...shared,
            ];
        case 'svelte':
            return [
                `import { getContext } from 'svelte';`,
                `import { derived } from 'svelte/store';`,
                `import type { MutationOptions, QueryOptions } from '@tanstack/svelte-query';`,
                `import { SvelteQueryContextKey, type RequestHandlerContext } from '@zenstackhq/tanstack-query/runtime/${target}';`,
                ...shared,
            ];
        default:
            throw new PluginError(name, `Unsupported target: ${target}`);
    }
}

function makeQueryOptions(target: string, returnType: string) {
    switch (target) {
        case 'react':
            return `UseQueryOptions<${returnType}>`;
        case 'svelte':
            return `QueryOptions<${returnType}>`;
        default:
            throw new PluginError(name, `Unsupported target: ${target}`);
    }
}

function makeMutationOptions(target: string, returnType: string, argsType: string) {
    switch (target) {
        case 'react':
            return `UseMutationOptions<${returnType}, unknown, ${argsType}>`;
        case 'svelte':
            return `MutationOptions<${returnType}, unknown, ${argsType}>`;
        default:
            throw new PluginError(name, `Unsupported target: ${target}`);
    }
}
