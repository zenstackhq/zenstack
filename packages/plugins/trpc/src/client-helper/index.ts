import { PluginError, type PluginOptions } from '@zenstackhq/sdk';
import { getPrismaClientImportSpec } from '@zenstackhq/sdk/prisma';
import fs from 'fs';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import {
    InterfaceDeclarationStructure,
    Project,
    PropertySignatureStructure,
    SourceFile,
    StructureKind,
} from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '..';
import { SupportedClientHelpers } from '../utils';
import * as NextHelpers from './next';
import * as NuxtHelpers from './nuxt';
import * as ReactHelpers from './react';

const helpers = {
    react: ReactHelpers,
    next: NextHelpers,
    nuxt: NuxtHelpers,
};

export function generateClientTypingForModel(
    project: Project,
    generateClientHelpers: SupportedClientHelpers[],
    model: string,
    options: PluginOptions,
    generateOperations: Array<{ name: string; baseType: string }>,
    version: string,
    outDir: string
) {
    for (const clientType of generateClientHelpers) {
        const sf = project.createSourceFile(
            path.resolve(outDir, `client/${upperCaseFirst(model)}.${clientType}.type.ts`),
            undefined,
            {
                overwrite: true,
            }
        );

        generateImports(clientType, sf, options, version);

        // generate a `ClientType` interface that contains typing for query/mutation operations
        const routerTypingStructure: InterfaceDeclarationStructure = {
            kind: StructureKind.Interface,
            name: 'ClientType',
            isExported: true,
            typeParameters: ['AppRouter extends AnyRouter', `Context = AppRouter['_def']['_config']['$types']['ctx']`],
            properties: [] as PropertySignatureStructure[],
        };

        for (const { name: generateOpName, baseType: baseOpType } of generateOperations) {
            routerTypingStructure.properties?.push({
                kind: StructureKind.PropertySignature,
                name: generateOpName,
                type: (writer) => {
                    helpers[clientType].generateProcedureTyping(writer, generateOpName, model, baseOpType, version);
                },
            });
        }

        sf.addInterface(routerTypingStructure);
    }
}

function generateImports(
    clientHelperType: SupportedClientHelpers,
    sourceFile: SourceFile,
    options: PluginOptions,
    version: string
) {
    const importingDir = sourceFile.getDirectoryPath();
    const prismaImport = getPrismaClientImportSpec(importingDir, options);
    sourceFile.addStatements([
        `import type { Prisma } from '${prismaImport}';`,
        `import type { TRPCClientErrorLike, TRPCRequestOptions } from '@trpc/client';`,
    ]);

    // generate framework-specific imports
    helpers[clientHelperType].generateRouterTypingImports(sourceFile, version);
}

export function createClientHelperEntries(
    project: Project,
    outputDir: string,
    generateClientHelpers: SupportedClientHelpers[],
    models: string[],
    version: string
) {
    // generate utils
    const content = fs.readFileSync(path.join(__dirname, `../res/client/${version}/utils.ts`), 'utf-8');
    project.createSourceFile(path.resolve(outputDir, 'client', `utils.ts`), content, {
        overwrite: true,
    });

    for (const client of generateClientHelpers) {
        createClientHelperEntryForType(project, client, models, version, outputDir);
    }
}

function createClientHelperEntryForType(
    project: Project,
    clientHelperType: SupportedClientHelpers,
    models: string[],
    version: string,
    outputDir: string
) {
    const content = fs.readFileSync(path.join(__dirname, `../res/client/${version}/${clientHelperType}.ts`), 'utf-8');
    const sf = project.createSourceFile(path.resolve(outputDir, 'client', `${clientHelperType}.ts`), content, {
        overwrite: true,
    });

    sf.addInterface({
        name: 'ClientType',
        typeParameters: ['AppRouter extends AnyRouter'],
        isExported: true,
        properties: models.map((model) => {
            sf.addImportDeclaration({
                namedImports: [{ name: 'ClientType', alias: `${upperCaseFirst(model)}ClientType` }],
                moduleSpecifier: `./${upperCaseFirst(model)}.${clientHelperType}.type`,
            });
            return {
                name: lowerCaseFirst(model),
                type: `${upperCaseFirst(model)}ClientType<AppRouter>`,
            } as PropertySignatureStructure;
        }),
    });
}

/**
 * Given a model and Prisma operation, returns related TS types.
 */
export function getPrismaOperationTypes(model: string, operation: string) {
    // TODO: find a way to derive from Prisma Client API's generic types
    // instead of duplicating them

    const capModel = upperCaseFirst(model);
    const capOperation = upperCaseFirst(operation);

    let genericBase = `Prisma.${capModel}${capOperation}Args`;
    const getPayload = `Prisma.${capModel}GetPayload<T>`;
    const selectSubset = `Prisma.SelectSubset<T, ${genericBase}>`;

    let argsType: string;
    let resultType: string;
    const argsOptional = ['findMany', 'findFirst', 'findFirstOrThrow', 'createMany', 'deleteMany', 'count'].includes(
        operation
    );

    switch (operation) {
        case 'findUnique':
        case 'findFirst':
            argsType = selectSubset;
            resultType = `${getPayload} | null`;
            break;

        case 'findUniqueOrThrow':
        case 'findFirstOrThrow':
            argsType = selectSubset;
            resultType = getPayload;
            break;

        case 'findMany':
            argsType = selectSubset;
            resultType = `Array<${getPayload}>`;
            break;

        case 'create':
            argsType = selectSubset;
            resultType = getPayload;
            break;

        case 'createMany':
            argsType = selectSubset;
            resultType = `Prisma.BatchPayload`;
            break;

        case 'update':
            argsType = selectSubset;
            resultType = getPayload;
            break;

        case 'updateMany':
            argsType = selectSubset;
            resultType = `Prisma.BatchPayload`;
            break;

        case 'upsert':
            argsType = selectSubset;
            resultType = getPayload;
            break;

        case 'delete':
            argsType = selectSubset;
            resultType = getPayload;
            break;

        case 'deleteMany':
            argsType = selectSubset;
            resultType = `Prisma.BatchPayload`;
            break;

        case 'count':
            argsType = `Prisma.Subset<T, ${genericBase}>`;
            resultType = `'select' extends keyof T
            ? T['select'] extends true
              ? number
              : Prisma.GetScalarType<T['select'], Prisma.${capModel}CountAggregateOutputType>
            : number`;
            break;

        case 'aggregate':
            argsType = `Prisma.Subset<T, ${genericBase}>`;
            resultType = `Prisma.Get${capModel}AggregateType<T>`;
            break;

        case 'groupBy':
            genericBase = `Prisma.${capModel}GroupByArgs,
            HasSelectOrTake extends Prisma.Or<
              Prisma.Extends<'skip', Prisma.Keys<T>>,
              Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
              ? { orderBy: Prisma.${capModel}GroupByArgs['orderBy'] }
              : { orderBy?: Prisma.${capModel}GroupByArgs['orderBy'] },
            OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>,
            ByFields extends Prisma.MaybeTupleToUnion<T['by']>,
            ByValid extends Prisma.Has<ByFields, OrderFields>,
            HavingFields extends Prisma.GetHavingFields<T['having']>,
            HavingValid extends Prisma.Has<ByFields, HavingFields>,
            ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False,
            InputErrors extends ByEmpty extends Prisma.True
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
              }[OrderFields]
          `;
            argsType = `Prisma.SubsetIntersection<T, Prisma.${capModel}GroupByArgs, OrderByArg> & InputErrors`;
            resultType = `{} extends InputErrors ? Prisma.Get${capModel}GroupByPayload<T> : InputErrors`;
            break;

        default:
            throw new PluginError(name, `Unsupported operation: "${operation}"`);
    }

    return { genericBase, argsType, resultType, argsOptional };
}
