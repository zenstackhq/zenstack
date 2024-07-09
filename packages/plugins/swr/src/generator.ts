import {
    PluginOptions,
    RUNTIME_PACKAGE,
    createProject,
    ensureEmptyDir,
    generateModelMeta,
    getDataModels,
    isDelegateModel,
    requireOption,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, DataModelFieldType, Model, isEnum } from '@zenstackhq/sdk/ast';
import { getPrismaClientImportSpec, supportCreateMany, type DMMF } from '@zenstackhq/sdk/prisma';
import { paramCase } from 'change-case';
import path from 'path';
import type { OptionalKind, ParameterDeclarationStructure, Project, SourceFile } from 'ts-morph';
import { P, match } from 'ts-pattern';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output', name);
    outDir = resolvePath(outDir, options);
    ensureEmptyDir(outDir);

    const project = createProject();
    const warnings: string[] = [];

    const models = getDataModels(model);

    await generateModelMeta(project, models, {
        output: path.join(outDir, '__model_meta.ts'),
        generateAttributes: false,
    });

    generateIndex(project, outDir, models);

    models.forEach((dataModel) => {
        const mapping = dmmf.mappings.modelOperations.find((op) => op.model === dataModel.name);
        if (!mapping) {
            warnings.push(`Unable to find mapping for model ${dataModel.name}`);
            return;
        }
        generateModelHooks(project, outDir, dataModel, mapping, options);
    });

    await saveProject(project);
    return { warnings };
}

function generateModelHooks(
    project: Project,
    outDir: string,
    model: DataModel,
    mapping: DMMF.ModelMapping,
    options: PluginOptions
) {
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(path.join(outDir, `${fileName}.ts`), undefined, { overwrite: true });

    sf.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(outDir, options);
    sf.addImportDeclaration({
        namedImports: ['Prisma'],
        isTypeOnly: true,
        moduleSpecifier: prismaImport,
    });
    sf.addStatements([
        `import { type GetNextArgs, type QueryOptions, type InfiniteQueryOptions, type MutationOptions, type PickEnumerable } from '@zenstackhq/swr/runtime';`,
        `import type { PolicyCrudKind } from '${RUNTIME_PACKAGE}'`,
        `import metadata from './__model_meta';`,
        `import * as request from '@zenstackhq/swr/runtime';`,
    ]);

    const modelNameCap = upperCaseFirst(model.name);

    const mutationFuncs: string[] = [];

    // Note: delegate models don't support create and upsert operations

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!isDelegateModel(model) && (mapping.create || (mapping as any).createOne)) {
        const argsType = `Prisma.${model.name}CreateArgs`;
        mutationFuncs.push(generateMutation(sf, model, 'POST', 'create', argsType, false));
    }

    // createMany
    if (!isDelegateModel(model) && mapping.createMany && supportCreateMany(model.$container)) {
        const argsType = `Prisma.${model.name}CreateManyArgs`;
        mutationFuncs.push(generateMutation(sf, model, 'POST', 'createMany', argsType, true));
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
        mutationFuncs.push(generateMutation(sf, model, 'PUT', 'update', argsType, false));
    }

    // updateMany
    if (mapping.updateMany) {
        const argsType = `Prisma.${model.name}UpdateManyArgs`;
        mutationFuncs.push(generateMutation(sf, model, 'PUT', 'updateMany', argsType, true));
    }

    // upsert
    // upsert is somehow named "upsertOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!isDelegateModel(model) && (mapping.upsert || (mapping as any).upsertOne)) {
        const argsType = `Prisma.${model.name}UpsertArgs`;
        mutationFuncs.push(generateMutation(sf, model, 'POST', 'upsert', argsType, false));
    }

    // del
    // delete is somehow named "deleteOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.delete || (mapping as any).deleteOne) {
        const argsType = `Prisma.${model.name}DeleteArgs`;
        mutationFuncs.push(generateMutation(sf, model, 'DELETE', 'delete', argsType, false));
    }

    // deleteMany
    if (mapping.deleteMany) {
        const argsType = `Prisma.${model.name}DeleteManyArgs`;
        mutationFuncs.push(generateMutation(sf, model, 'DELETE', 'deleteMany', argsType, true));
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
        const useName = model.name;
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

    // extra `check` hook for ZenStack's permission checker API
    {
        generateCheckHook(sf, model, prismaImport);
    }
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

    const funcName = `${operation}${model.name}`;

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

function generateCheckHook(sf: SourceFile, model: DataModel, prismaImport: string) {
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
        parameters: [
            { name: 'args', type: `{ operation: PolicyCrudKind; where?: ${whereType}; }` },
            { name: 'options?', type: `QueryOptions<boolean>` },
        ],
    });

    func.addStatements(`return request.useModelQuery('${model.name}', 'check', args, options);`);
}
