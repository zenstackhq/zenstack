import { DataModel, isDataModel, Model } from '@zenstackhq/language/ast';
import { PluginOptions } from '@zenstackhq/sdk';
import { paramCase } from 'change-case';
import * as path from 'path';
import { Project } from 'ts-morph';
import { RUNTIME_PACKAGE } from '../constants';

export async function generate(model: Model, options: PluginOptions) {
    const project = new Project();
    const models: DataModel[] = [];
    const warnings: string[] = [];

    for (const dm of model.declarations.filter((d): d is DataModel =>
        isDataModel(d)
    )) {
        const hasAllowRule = dm.attributes.find(
            (attr) => attr.decl.ref?.name === '@@allow'
        );
        if (!hasAllowRule) {
            warnings.push(
                `Not generating hooks for "${dm.name}" because it doesn't have any @@allow rule`
            );
        } else {
            models.push(dm);
        }
    }

    const outDir =
        (options.output as string) ?? 'node_modules/.zenstack/src/hooks';

    generateIndex(project, outDir, models);

    models.forEach((d) => generateModelHooks(project, outDir, d));

    await project.save();
    return warnings;
}

function wrapReadbackErrorCheck(code: string) {
    return `try {
        ${code}
    } catch (err: any) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2004') {
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
    model: DataModel
) {
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(
        path.join(outDir, `${fileName}.ts`),
        undefined,
        { overwrite: true }
    );

    sf.addImportDeclaration({
        namedImports: [{ name: 'Prisma' }, `type ${model.name}`],
        moduleSpecifier: '@prisma/client',
    });
    sf.addStatements([
        `import { useContext } from 'react';`,
        `import { RequestHandlerContext } from '@zenstackhq/next';`,
        `import * as request from '${RUNTIME_PACKAGE}/request';`,
        `import { RequestOptions } from '${RUNTIME_PACKAGE}/types';`,
    ]);

    const useFunc = sf.addFunction({
        name: `use${model.name}`,
        isExported: true,
    });

    useFunc.addStatements([
        'const mutate = request.getMutate();',
        'const { endpoint } = useContext(RequestHandlerContext);',
    ]);

    // create
    {
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
                    `return await request.post<${inputType}, ${returnType}>(\`\${endpoint}/${model.name}/create\`, args, mutate);`
                ),
            ]);
    }

    // createMany
    {
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
                `return await request.post<${inputType}, ${returnType}>(\`\${endpoint}/${model.name}/createMany\`, args, mutate);`,
            ]);
    }

    // findMany
    {
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
                `return request.get<${returnType}>(\`\${endpoint}/${model.name}/findMany\`, args, options);`,
            ]);
    }

    // findUnique
    {
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
                `return request.get<${returnType}>(\`\${endpoint}/${model.name}/findUnique\`, args, options);`,
            ]);
    }

    // findFirst
    {
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
                `return request.get<${returnType}>(\`\${endpoint}/${model.name}/findFirst\`, args, options);`,
            ]);
    }

    // update
    {
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
                    `return await request.put<${inputType}, ${returnType}>(\`\${endpoint}/${model.name}/update\`, args, mutate);`
                ),
            ]);
    }

    // updateMany
    {
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
                `return await request.put<${inputType}, ${returnType}>(\`\${endpoint}/${model.name}/updateMany\`, args, mutate);`,
            ]);
    }

    // upsert
    {
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
                    `return await request.put<${inputType}, ${returnType}>(\`\${endpoint}/${model.name}/upsert\`, args, mutate);`
                ),
            ]);
    }

    // del
    {
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
                    `return await request.del<${returnType}>(\`\${endpoint}/${model.name}/delete\`, args, mutate);`
                ),
            ]);
    }

    // deleteMany
    {
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
                `return await request.del<${returnType}>(\`\${endpoint}/${model.name}/deleteMany\`, args, mutate);`,
            ]);
    }

    // aggregate
    {
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
                `return request.get<${returnType}>(\`\${endpoint}/${model.name}/aggregate\`, args, options);`,
            ]);
    }

    // groupBy
    {
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
                `return request.get<${returnType}>(\`\${endpoint}/${model.name}/groupBy\`, args, options);`,
            ]);
    }

    // count
    {
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
                `return request.get<${returnType}>(\`\${endpoint}/${model.name}/count\`, args, options);`,
            ]);
    }

    useFunc.addStatements([
        'return { create, createMany, findMany, findUnique, findFirst, update, updateMany, upsert, del, deleteMany, aggregate, groupBy, count };',
    ]);

    sf.formatText();
}

function generateIndex(project: Project, outDir: string, models: DataModel[]) {
    const sf = project.createSourceFile(
        path.join(outDir, 'index.ts'),
        undefined,
        { overwrite: true }
    );

    sf.addStatements(
        models.map((d) => `export * from './${paramCase(d.name)}';`)
    );

    sf.formatText();
}
