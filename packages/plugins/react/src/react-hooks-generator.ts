import { DMMF } from '@prisma/generator-helper';
import { PluginError, PluginOptions } from '@zenstackhq/sdk';
import { DataModel, isDataModel, Model } from '@zenstackhq/sdk/ast';
import { camelCase, paramCase } from 'change-case';
import * as path from 'path';
import { Project } from 'ts-morph';

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
    const models = model.declarations.filter((d): d is DataModel => isDataModel(d));

    generateIndex(project, outDir, models);

    models.forEach((model) => {
        const mapping = dmmf.mappings.modelOperations.find((op) => op.model === model.name);
        generateModelHooks(project, outDir, model, mapping);
    });

    await project.save();
    return warnings;
}

function wrapReadbackErrorCheck(code: string) {
    return `try {
        ${code}
    } catch (err: any) {
        if (err.info?.prisma && err.info?.code === 'P2004' && err.info?.reason === 'RESULT_NOT_READABLE') {
            // unable to readback data
            return undefined;
        } else {
            throw err;
        }
    }`;
}

function generateModelHooks(
    project: Project,
    outDir: string,
    model: DataModel,
    mapping: DMMF.ModelMapping | undefined
) {
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
        `import { RequestHandlerContext, type RequestOptions } from '@zenstackhq/react/runtime';`,
        `import * as request from '@zenstackhq/react/runtime';`,
    ]);

    const useFunc = sf.addFunction({
        name: `use${model.name}`,
        isExported: true,
    });

    const prefixesToMutate = ['find', 'aggregate', 'count', 'groupBy'];
    const modelRouteName = camelCase(model.name);

    useFunc.addStatements([
        'const { endpoint } = useContext(RequestHandlerContext);',
        `const prefixesToMutate = [${prefixesToMutate
            .map((prefix) => '`${endpoint}/' + modelRouteName + '/' + prefix + '`')
            .join(', ')}];`,
        'const mutate = request.getMutate(prefixesToMutate);',
    ]);

    const methods: string[] = [];

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping?.create || (mapping as any)?.createOne) {
        methods.push('create');
        const argsType = `Prisma.${model.name}CreateArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.CheckSelect<T, ${model.name}, Prisma.${model.name}GetPayload<T>>`;
        useFunc
            .addFunction({
                name: 'create',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                wrapReadbackErrorCheck(
                    `return await request.post<${inputType}, ${returnType}>(\`\${endpoint}/${modelRouteName}/create\`, args, mutate);`
                ),
            ]);
    }

    // createMany
    if (mapping?.createMany) {
        methods.push('createMany');
        const argsType = `Prisma.${model.name}CreateManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.BatchPayload`;
        useFunc
            .addFunction({
                name: 'createMany',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return await request.post<${inputType}, ${returnType}>(\`\${endpoint}/${modelRouteName}/createMany\`, args, mutate);`,
            ]);
    }

    // findMany
    if (mapping?.findMany) {
        methods.push('findMany');
        const argsType = `Prisma.${model.name}FindManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Array<Prisma.${model.name}GetPayload<T>>`;
        useFunc
            .addFunction({
                name: 'findMany',
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args?',
                        type: inputType,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<${returnType}>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/findMany\`, args, options);`,
            ]);
    }

    // findUnique
    if (mapping?.findUnique) {
        methods.push('findUnique');
        const argsType = `Prisma.${model.name}FindUniqueArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        useFunc
            .addFunction({
                name: 'findUnique',
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<${returnType}>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/findUnique\`, args, options);`,
            ]);
    }

    // findFirst
    if (mapping?.findFirst) {
        methods.push('findFirst');
        const argsType = `Prisma.${model.name}FindFirstArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        useFunc
            .addFunction({
                name: 'findFirst',
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<${returnType}>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/findFirst\`, args, options);`,
            ]);
    }

    // update
    // update is somehow named "updateOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping?.update || (mapping as any).updateOne) {
        methods.push('update');
        const argsType = `Prisma.${model.name}UpdateArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        useFunc
            .addFunction({
                name: 'update',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                wrapReadbackErrorCheck(
                    `return await request.put<${inputType}, ${returnType}>(\`\${endpoint}/${modelRouteName}/update\`, args, mutate);`
                ),
            ]);
    }

    // updateMany
    if (mapping?.updateMany) {
        methods.push('updateMany');
        const argsType = `Prisma.${model.name}UpdateManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.BatchPayload`;
        useFunc
            .addFunction({
                name: 'updateMany',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return await request.put<${inputType}, ${returnType}>(\`\${endpoint}/${modelRouteName}/updateMany\`, args, mutate);`,
            ]);
    }

    // upsert
    // upsert is somehow named "upsertOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping?.upsert || (mapping as any).upsertOne) {
        methods.push('upsert');
        const argsType = `Prisma.${model.name}UpsertArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        useFunc
            .addFunction({
                name: 'upsert',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                wrapReadbackErrorCheck(
                    `return await request.post<${inputType}, ${returnType}>(\`\${endpoint}/${modelRouteName}/upsert\`, args, mutate);`
                ),
            ]);
    }

    // del
    // delete is somehow named "deleteOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping?.delete || (mapping as any).deleteOne) {
        methods.push('del');
        const argsType = `Prisma.${model.name}DeleteArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        useFunc
            .addFunction({
                name: 'del',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args?',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                wrapReadbackErrorCheck(
                    `return await request.del<${returnType}>(\`\${endpoint}/${modelRouteName}/delete\`, args, mutate);`
                ),
            ]);
    }

    // deleteMany
    if (mapping?.deleteMany) {
        methods.push('deleteMany');
        const argsType = `Prisma.${model.name}DeleteManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.BatchPayload`;
        useFunc
            .addFunction({
                name: 'deleteMany',
                isAsync: true,
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args?',
                        type: inputType,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return await request.del<${returnType}>(\`\${endpoint}/${modelRouteName}/deleteMany\`, args, mutate);`,
            ]);
    }

    // aggregate
    if (mapping?.aggregate) {
        methods.push('aggregate');
        const argsType = `Prisma.${model.name}AggregateArgs`;
        const inputType = `Prisma.Subset<T, ${argsType}>`;
        const returnType = `Prisma.Get${model.name}AggregateType<T>`;
        useFunc
            .addFunction({
                name: 'aggregate',
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<${returnType}>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/aggregate\`, args, options);`,
            ]);
    }

    // groupBy
    if (mapping?.groupBy) {
        methods.push('groupBy');
        const returnType = `{} extends InputErrors ? Prisma.Get${model.name}GroupByPayload<T> : InputErrors`;
        useFunc
            .addFunction({
                name: 'groupBy',
                typeParameters: [
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
                ],
                parameters: [
                    {
                        name: 'args',
                        type: `Prisma.SubsetIntersection<T, Prisma.${model.name}GroupByArgs, OrderByArg> & InputErrors`,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<${returnType}>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/groupBy\`, args, options);`,
            ]);
    }

    // count
    if (mapping?.count) {
        methods.push('count');
        const argsType = `Prisma.${model.name}CountArgs`;
        const inputType = `Prisma.Subset<T, ${argsType}>`;
        const returnType = `T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.${model.name}CountAggregateOutputType> : number`;
        useFunc
            .addFunction({
                name: 'count',
                typeParameters: [`T extends ${argsType}`],
                parameters: [
                    {
                        name: 'args',
                        type: inputType,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<${returnType}>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/count\`, args, options);`,
            ]);
    }

    useFunc.addStatements([`return { ${methods.join(', ')} };`]);

    sf.formatText();
}

function generateIndex(project: Project, outDir: string, models: DataModel[]) {
    const sf = project.createSourceFile(path.join(outDir, 'index.ts'), undefined, { overwrite: true });

    sf.addStatements(models.map((d) => `export * from './${paramCase(d.name)}';`));

    sf.formatText();
}
