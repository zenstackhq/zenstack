import type { DMMF } from '@prisma/generator-helper';
import {
    PluginOptions,
    createProject,
    generateModelMeta,
    getDataModels,
    getPrismaClientImportSpec,
    getPrismaVersion,
    requireOption,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, Model } from '@zenstackhq/sdk/ast';
import { paramCase } from 'change-case';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import semver from 'semver';
import { FunctionDeclaration, OptionalKind, ParameterDeclarationStructure, Project, SourceFile } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output', name);
    outDir = resolvePath(outDir, options);

    const project = createProject();
    const warnings: string[] = [];

    if (options.useSuperJson !== undefined) {
        warnings.push(
            'The option "useSuperJson" is deprecated. The generated hooks always use superjson for serialization.'
        );
    }

    const legacyMutations = options.legacyMutations !== false;

    const models = getDataModels(model);

    await generateModelMeta(project, models, {
        output: path.join(outDir, '__model_meta.ts'),
        compile: false,
        preserveTsFiles: true,
        generateAttributes: false,
    });

    generateIndex(project, outDir, models);

    models.forEach((dataModel) => {
        const mapping = dmmf.mappings.modelOperations.find((op) => op.model === dataModel.name);
        if (!mapping) {
            warnings.push(`Unable to find mapping for model ${dataModel.name}`);
            return;
        }
        generateModelHooks(project, outDir, dataModel, mapping, legacyMutations);
    });

    await saveProject(project);
    return warnings;
}

function generateModelHooks(
    project: Project,
    outDir: string,
    model: DataModel,
    mapping: DMMF.ModelMapping,
    legacyMutations: boolean
) {
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(path.join(outDir, `${fileName}.ts`), undefined, { overwrite: true });

    sf.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(model.$container, outDir);
    sf.addImportDeclaration({
        namedImports: ['Prisma'],
        isTypeOnly: true,
        moduleSpecifier: prismaImport,
    });
    sf.addStatements([
        `import { type GetNextArgs, type QueryOptions, type InfiniteQueryOptions, type MutationOptions, type PickEnumerable, useHooksContext } from '@zenstackhq/swr/runtime';`,
        `import metadata from './__model_meta';`,
        `import * as request from '@zenstackhq/swr/runtime';`,
    ]);

    const modelNameCap = upperCaseFirst(model.name);
    const prismaVersion = getPrismaVersion();

    const useMutation = legacyMutations
        ? sf.addFunction({
              name: `useMutate${model.name}`,
              isExported: true,
              statements: [
                  'const { endpoint, fetch } = useHooksContext();',
                  `const invalidate = request.useInvalidation('${model.name}', metadata);`,
              ],
              docs: ['@deprecated Use mutation hooks (useCreateXXX, useUpdateXXX, etc.) instead.'],
          })
        : undefined;

    const mutationFuncs: string[] = [];

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.create || (mapping as any).createOne) {
        const argsType = `Prisma.${model.name}CreateArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'POST', 'create', argsType, false));
    }

    // createMany
    if (mapping.createMany) {
        const argsType = `Prisma.${model.name}CreateManyArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'POST', 'createMany', argsType, true));
    }

    // findMany
    if (mapping.findMany) {
        const argsType = `Prisma.${model.name}FindManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnElement = `Prisma.${model.name}GetPayload<T>`;
        const returnType = `Array<${returnElement}>`;
        const optimisticReturn = `Array<${makeOptimistic(returnElement)}>`;

        // regular findMany
        generateQueryHook(sf, model, 'findMany', argsType, inputType, optimisticReturn, undefined, false);

        // infinite findMany
        generateQueryHook(sf, model, 'findMany', argsType, inputType, returnType, undefined, true);
    }

    // findUnique
    if (mapping.findUnique) {
        const argsType = `Prisma.${model.name}FindUniqueArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = makeOptimistic(`Prisma.${model.name}GetPayload<T>`);
        generateQueryHook(sf, model, 'findUnique', argsType, inputType, returnType, undefined, false);
    }

    // findFirst
    if (mapping.findFirst) {
        const argsType = `Prisma.${model.name}FindFirstArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = makeOptimistic(`Prisma.${model.name}GetPayload<T>`);
        generateQueryHook(sf, model, 'findFirst', argsType, inputType, returnType, undefined, false);
    }

    // update
    // update is somehow named "updateOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.update || (mapping as any).updateOne) {
        const argsType = `Prisma.${model.name}UpdateArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'PUT', 'update', argsType, false));
    }

    // updateMany
    if (mapping.updateMany) {
        const argsType = `Prisma.${model.name}UpdateManyArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'PUT', 'updateMany', argsType, true));
    }

    // upsert
    // upsert is somehow named "upsertOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.upsert || (mapping as any).upsertOne) {
        const argsType = `Prisma.${model.name}UpsertArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'POST', 'upsert', argsType, false));
    }

    // del
    // delete is somehow named "deleteOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.delete || (mapping as any).deleteOne) {
        const argsType = `Prisma.${model.name}DeleteArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'DELETE', 'delete', argsType, false));
    }

    // deleteMany
    if (mapping.deleteMany) {
        const argsType = `Prisma.${model.name}DeleteManyArgs`;
        mutationFuncs.push(generateMutation(sf, useMutation, model, 'DELETE', 'deleteMany', argsType, true));
    }

    // aggregate
    if (mapping.aggregate) {
        const argsType = `Prisma.${modelNameCap}AggregateArgs`;
        const inputType = `Prisma.Subset<T, ${argsType}>`;
        const returnType = `Prisma.Get${modelNameCap}AggregateType<T>`;
        generateQueryHook(sf, model, 'aggregate', argsType, inputType, returnType);
    }

    // groupBy
    if (mapping.groupBy) {
        let useName = modelNameCap;
        if (prismaVersion && semver.gte(prismaVersion, '5.0.0')) {
            // prisma 4 and 5 different typing for "groupBy" and we have to deal with it separately
            useName = model.name;
        }
        const typeParameters = [
            `T extends Prisma.${useName}GroupByArgs`,
            `HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>`,
            `OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.${useName}GroupByArgs['orderBy'] }: { orderBy?: Prisma.${useName}GroupByArgs['orderBy'] },`,
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
        const inputType = `Prisma.SubsetIntersection<T, Prisma.${useName}GroupByArgs, OrderByArg> & InputErrors`;
        const returnType = `{} extends InputErrors ? 
        Array<PickEnumerable<Prisma.${modelNameCap}GroupByOutputType, T['by']> &
          {
            [P in ((keyof T) & (keyof Prisma.${modelNameCap}GroupByOutputType))]: P extends '_count'
              ? T[P] extends boolean
                ? number
                : Prisma.GetScalarType<T[P], Prisma.${modelNameCap}GroupByOutputType[P]>
              : Prisma.GetScalarType<T[P], Prisma.${modelNameCap}GroupByOutputType[P]>
          }
        > : InputErrors`;
        generateQueryHook(sf, model, 'groupBy', '', inputType, returnType, typeParameters);
    }

    // somehow dmmf doesn't contain "count" operation, so we unconditionally add it here
    {
        const argsType = `Prisma.${model.name}CountArgs`;
        const inputType = `Prisma.Subset<T, ${argsType}>`;
        const returnType = `T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.${modelNameCap}CountAggregateOutputType> : number`;
        generateQueryHook(sf, model, 'count', argsType, inputType, returnType);
    }

    useMutation?.addStatements(`return { ${mutationFuncs.join(', ')} };`);
}

function makeOptimistic(returnType: string) {
    return `${returnType} & { $optimistic?: boolean }`;
}

function generateIndex(project: Project, outDir: string, models: DataModel[]) {
    const sf = project.createSourceFile(path.join(outDir, 'index.ts'), undefined, { overwrite: true });
    sf.addStatements(models.map((d) => `export * from './${paramCase(d.name)}';`));
    sf.addStatements(`export { Provider } from '@zenstackhq/swr/runtime';`);
}

function generateQueryHook(
    sf: SourceFile,
    model: DataModel,
    operation: string,
    argsType: string,
    inputType: string,
    returnType: string,
    typeParameters?: string[],
    infinite = false
) {
    const typeParams = typeParameters ? [...typeParameters] : [`T extends ${argsType}`];
    if (infinite) {
        typeParams.push(`R extends ${returnType}`);
    }

    const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];
    if (!infinite) {
        parameters.push({
            name: 'args?',
            type: inputType,
        });
    } else {
        parameters.push({
            name: 'getNextArgs',
            type: `GetNextArgs<${inputType} | undefined, R>`,
        });
    }
    parameters.push({
        name: 'options?',
        type: infinite ? `InfiniteQueryOptions<${returnType}>` : `QueryOptions<${returnType}>`,
    });

    sf.addFunction({
        name: `use${infinite ? 'Infinite' : ''}${upperCaseFirst(operation)}${model.name}`,
        typeParameters: typeParams,
        isExported: true,
        parameters,
    })
        .addBody()
        .addStatements([
            !infinite
                ? `return request.useModelQuery('${model.name}', '${operation}', args, options);`
                : `return request.useInfiniteModelQuery('${model.name}', '${operation}', getNextArgs, options);`,
        ]);
}

function generateMutation(
    sf: SourceFile,
    useMutateModelFunc: FunctionDeclaration | undefined,
    model: DataModel,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    operation: string,
    argsType: string,
    batchResult: boolean
) {
    // non-batch mutations are subject to read-back check
    const checkReadBack = !batchResult;
    const genericReturnType = batchResult ? 'Prisma.BatchPayload' : `Prisma.${model.name}GetPayload<T> | undefined`;
    const returnType = batchResult ? 'Prisma.BatchPayload' : `Prisma.${model.name}GetPayload<${argsType}> | undefined`;
    const genericInputType = `Prisma.SelectSubset<T, ${argsType}>`;

    const modelRouteName = lowerCaseFirst(model.name);
    const funcName = `${operation}${model.name}`;

    if (useMutateModelFunc) {
        // generate async mutation function (legacy)
        const mutationFunc = useMutateModelFunc.addFunction({
            name: funcName,
            isAsync: true,
            typeParameters: [`T extends ${argsType}`],
            parameters: [
                {
                    name: 'args',
                    type: genericInputType,
                },
            ],
        });
        mutationFunc.addJsDoc(`@deprecated Use \`use${upperCaseFirst(operation)}${model.name}\` hook instead.`);
        mutationFunc
            .addBody()
            .addStatements([
                `return await request.mutationRequest<${returnType}, ${checkReadBack}>('${method}', \`\${endpoint}/${modelRouteName}/${operation}\`, args, invalidate, fetch, ${checkReadBack});`,
            ]);
    }

    // generate mutation hook
    sf.addFunction({
        name: `use${upperCaseFirst(operation)}${model.name}`,
        isExported: true,
        parameters: [
            {
                name: 'options?',
                type: `MutationOptions<${returnType}, unknown, ${argsType}>`,
            },
        ],
    })
        .addBody()
        .addStatements([
            `const mutation = request.useModelMutation('${model.name}', '${method}', '${operation}', metadata, options, ${checkReadBack});`,
            `return {
                ...mutation,
                trigger: <T extends ${argsType}>(args: ${genericInputType}) => {
                    return mutation.trigger(args, options as any) as Promise<${genericReturnType}>;
                }
            };`,
        ]);

    return funcName;
}
