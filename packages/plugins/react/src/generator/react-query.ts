import { DMMF } from '@prisma/generator-helper';
import { getDataModels, PluginError, PluginOptions } from '@zenstackhq/sdk';
import { DataModel, Model } from '@zenstackhq/sdk/ast';
import { paramCase, pascalCase } from 'change-case';
import * as path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = options.output as string;
    if (!outDir) {
        throw new PluginError('"output" option is required');
    }

    if (!path.isAbsolute(outDir)) {
        // output dir is resolved relative to the schema file path
        outDir = path.join(path.dirname(options.schemaPath), outDir);
    }

    const project = new Project();
    const warnings: string[] = [];
    const models = getDataModels(model);

    generateIndex(project, outDir, models);

    models.forEach((dataModel) => {
        const mapping = dmmf.mappings.modelOperations.find((op) => op.model === dataModel.name);
        if (!mapping) {
            warnings.push(`Unable to find mapping for model ${dataModel.name}`);
            return;
        }
        generateModelHooks(project, outDir, dataModel, mapping);
    });

    await project.save();
    return warnings;
}

function generateQueryHook(
    sf: SourceFile,
    model: string,
    operation: string,
    returnArray: boolean,
    optionalInput: boolean,
    overrideReturnType?: string,
    overrideInputType?: string,
    overrideTypeParameters?: string[]
) {
    const capOperation = pascalCase(operation);

    const argsType = overrideInputType ?? `Prisma.${model}${capOperation}Args`;
    const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
    const returnType =
        overrideReturnType ?? (returnArray ? `Array<Prisma.${model}GetPayload<T>>` : `Prisma.${model}GetPayload<T>`);
    const optionsType = `UseQueryOptions<${returnType}>`;

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
        'const { endpoint } = useContext(RequestHandlerContext);',
        `return request.query<${returnType}>('${model}', \`\${endpoint}/${model}/${operation}\`, args, options);`,
    ]);
}

function generateMutationHook(
    sf: SourceFile,
    model: string,
    operation: string,
    httpVerb: 'post' | 'put' | 'delete',
    overrideReturnType?: string
) {
    const capOperation = pascalCase(operation);

    const argsType = `Prisma.${model}${capOperation}Args`;
    const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
    const returnType = overrideReturnType ?? `Prisma.CheckSelect<T, ${model}, Prisma.${model}GetPayload<T>>`;
    const nonGenericOptionsType = `Omit<UseMutationOptions<${
        overrideReturnType ?? model
    }, unknown, ${argsType}>, 'mutationFn'>`;
    const optionsType = `Omit<UseMutationOptions<${returnType}, unknown, ${inputType}>, 'mutationFn'>`;

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
    func.addStatements(['const { endpoint } = useContext(RequestHandlerContext);']);

    func.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: `_mutation`,
                initializer: `
                    request.${httpVerb}Mutation<${argsType}, ${
                    overrideReturnType ?? model
                }>('${model}', \`\${endpoint}/${model}/${operation}\`, options, invalidateQueries)
                `,
            },
        ],
    });

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

    func.addStatements('return mutation;');
}

function generateModelHooks(project: Project, outDir: string, model: DataModel, mapping: DMMF.ModelMapping) {
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(path.join(outDir, `${fileName}.ts`), undefined, { overwrite: true });

    sf.addStatements('/* eslint-disable */');

    sf.addImportDeclaration({
        namedImports: ['Prisma', model.name],
        isTypeOnly: true,
        moduleSpecifier: '@prisma/client',
    });
    sf.addStatements([
        `import { useContext } from 'react';`,
        `import { RequestHandlerContext } from '@zenstackhq/react/runtime';`,
        `import * as request from '@zenstackhq/react/runtime/react-query';`,
        `import type { UseMutationOptions, UseQueryOptions } from '@tanstack/react-query';`,
    ]);

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.create || (mapping as any).createOne) {
        generateMutationHook(sf, model.name, 'create', 'post');
    }

    // createMany
    if (mapping.createMany) {
        generateMutationHook(sf, model.name, 'createMany', 'post');
    }

    // findMany
    if (mapping.findMany) {
        generateQueryHook(sf, model.name, 'findMany', true, true);
    }

    // findUnique
    if (mapping.findUnique) {
        generateQueryHook(sf, model.name, 'findUnique', false, false);
    }

    // findFirst
    if (mapping.findFirst) {
        generateQueryHook(sf, model.name, 'findFirst', false, true);
    }

    // update
    // update is somehow named "updateOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.update || (mapping as any).updateOne) {
        generateMutationHook(sf, model.name, 'update', 'put');
    }

    // updateMany
    if (mapping.updateMany) {
        generateMutationHook(sf, model.name, 'updateMany', 'put', 'Prisma.BatchPayload');
    }

    // upsert
    // upsert is somehow named "upsertOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.upsert || (mapping as any).upsertOne) {
        generateMutationHook(sf, model.name, 'upsert', 'post');
    }

    // del
    // delete is somehow named "deleteOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.delete || (mapping as any).deleteOne) {
        generateMutationHook(sf, model.name, 'delete', 'delete');
    }

    // deleteMany
    if (mapping.deleteMany) {
        generateMutationHook(sf, model.name, 'deleteMany', 'delete', 'Prisma.BatchPayload');
    }

    // aggregate
    if (mapping.aggregate) {
        generateQueryHook(sf, model.name, 'aggregate', false, false, `Prisma.Get${model.name}AggregateType<T>`);
    }

    // groupBy
    if (mapping.groupBy) {
        const typeParameters = [
            `T extends Prisma.${model.name}GroupByArgs`,
            `HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>`,
            `OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserGroupByArgs['orderBy'] }: { orderBy?: Prisma.UserGroupByArgs['orderBy'] },`,
            `OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>`,
            `ByFields extends Prisma.TupleToUnion<T['by']>`,
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

        generateQueryHook(
            sf,
            model.name,
            'groupBy',
            false,
            false,
            `{} extends InputErrors ? Prisma.Get${model.name}GroupByPayload<T> : InputErrors`,
            `Prisma.SubsetIntersection<T, Prisma.${model.name}GroupByArgs, OrderByArg> & InputErrors`,
            typeParameters
        );
    }

    // somehow dmmf doesn't contain "count" operation, so we unconditionally add it here
    {
        generateQueryHook(
            sf,
            model.name,
            'count',
            false,
            true,
            `T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.${model.name}CountAggregateOutputType> : number`
        );
    }

    sf.formatText();
}

function generateIndex(project: Project, outDir: string, models: DataModel[]) {
    const sf = project.createSourceFile(path.join(outDir, 'index.ts'), undefined, { overwrite: true });
    sf.addStatements(models.map((d) => `export * from './${paramCase(d.name)}';`));
    sf.formatText();
}
