import type { DMMF } from '@prisma/generator-helper';
import {
    PluginOptions,
    createProject,
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
import { FunctionDeclaration, Project, SourceFile } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output');
    outDir = resolvePath(outDir, options);

    const project = createProject();
    const warnings: string[] = [];

    if (options.useSuperJson !== undefined) {
        warnings.push(
            'The option "useSuperJson" is deprecated. The generated hooks always use superjson for serialization.'
        );
    }

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

    await saveProject(project);
    return warnings;
}

function generateModelHooks(project: Project, outDir: string, model: DataModel, mapping: DMMF.ModelMapping) {
    const fileName = paramCase(model.name);
    const sf = project.createSourceFile(path.join(outDir, `${fileName}.ts`), undefined, { overwrite: true });

    sf.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(model.$container, outDir);
    sf.addImportDeclaration({
        namedImports: ['Prisma', model.name],
        isTypeOnly: true,
        moduleSpecifier: prismaImport,
    });
    sf.addStatements([
        `import { useContext } from 'react';`,
        `import { RequestHandlerContext, type RequestOptions, type PickEnumerable, type CheckSelect } from '@zenstackhq/swr/runtime';`,
        `import * as request from '@zenstackhq/swr/runtime';`,
    ]);

    const modelNameCap = upperCaseFirst(model.name);
    const prismaVersion = getPrismaVersion();

    const prefixesToMutate = ['find', 'aggregate', 'count', 'groupBy'];
    const useMutation = sf.addFunction({
        name: `useMutate${model.name}`,
        isExported: true,
        statements: [
            'const { endpoint, fetch } = useContext(RequestHandlerContext);',
            `const prefixesToMutate = [${prefixesToMutate
                .map((prefix) => '`${endpoint}/' + lowerCaseFirst(model.name) + '/' + prefix + '`')
                .join(', ')}];`,
            'const mutate = request.getMutate(prefixesToMutate);',
        ],
    });
    const mutationFuncs: string[] = [];

    // create is somehow named "createOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.create || (mapping as any).createOne) {
        const argsType = `Prisma.${model.name}CreateArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `CheckSelect<T, ${model.name}, Prisma.${model.name}GetPayload<T>>`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'post', 'create', argsType, inputType, returnType, true)
        );
    }

    // createMany
    if (mapping.createMany) {
        const argsType = `Prisma.${model.name}CreateManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.BatchPayload`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'post', 'createMany', argsType, inputType, returnType, false)
        );
    }

    // findMany
    if (mapping.findMany) {
        const argsType = `Prisma.${model.name}FindManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Array<Prisma.${model.name}GetPayload<T>>`;
        generateQueryHook(sf, model, 'findMany', argsType, inputType, returnType);
    }

    // findUnique
    if (mapping.findUnique) {
        const argsType = `Prisma.${model.name}FindUniqueArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        generateQueryHook(sf, model, 'findUnique', argsType, inputType, returnType);
    }

    // findFirst
    if (mapping.findFirst) {
        const argsType = `Prisma.${model.name}FindFirstArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        generateQueryHook(sf, model, 'findFirst', argsType, inputType, returnType);
    }

    // update
    // update is somehow named "updateOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.update || (mapping as any).updateOne) {
        const argsType = `Prisma.${model.name}UpdateArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'put', 'update', argsType, inputType, returnType, true)
        );
    }

    // updateMany
    if (mapping.updateMany) {
        const argsType = `Prisma.${model.name}UpdateManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.BatchPayload`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'put', 'updateMany', argsType, inputType, returnType, false)
        );
    }

    // upsert
    // upsert is somehow named "upsertOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.upsert || (mapping as any).upsertOne) {
        const argsType = `Prisma.${model.name}UpsertArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'post', 'upsert', argsType, inputType, returnType, true)
        );
    }

    // del
    // delete is somehow named "deleteOne" in the DMMF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (mapping.delete || (mapping as any).deleteOne) {
        const argsType = `Prisma.${model.name}DeleteArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.${model.name}GetPayload<T>`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'delete', 'delete', argsType, inputType, returnType, true)
        );
    }

    // deleteMany
    if (mapping.deleteMany) {
        const argsType = `Prisma.${model.name}DeleteManyArgs`;
        const inputType = `Prisma.SelectSubset<T, ${argsType}>`;
        const returnType = `Prisma.BatchPayload`;
        mutationFuncs.push(
            generateMutation(useMutation, model, 'delete', 'deleteMany', argsType, inputType, returnType, false)
        );
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

    useMutation.addStatements(`return { ${mutationFuncs.join(', ')} };`);
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
    typeParameters?: string[]
) {
    const modelRouteName = lowerCaseFirst(model.name);
    sf.addFunction({
        name: `use${upperCaseFirst(operation)}${model.name}`,
        typeParameters: typeParameters ?? [`T extends ${argsType}`],
        isExported: true,
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
            'const { endpoint, fetch } = useContext(RequestHandlerContext);',
            `return request.get<${returnType}>(\`\${endpoint}/${modelRouteName}/${operation}\`, args, options, fetch);`,
        ]);
}

function generateMutation(
    func: FunctionDeclaration,
    model: DataModel,
    method: 'post' | 'put' | 'patch' | 'delete',
    operation: string,
    argsType: string,
    inputType: string,
    returnType: string,
    checkReadBack: boolean
) {
    const modelRouteName = lowerCaseFirst(model.name);
    const funcName = `${operation}${model.name}`;
    const fetcherFunc = method === 'delete' ? 'del' : method;
    func.addFunction({
        name: funcName,
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
            `return await request.${fetcherFunc}<${returnType}, ${checkReadBack}>(\`\${endpoint}/${modelRouteName}/${operation}\`, args, mutate, fetch, ${checkReadBack});`,
        ]);
    return funcName;
}
