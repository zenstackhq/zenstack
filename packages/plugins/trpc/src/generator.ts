import {
    CrudFailureReason,
    ensureEmptyDir,
    isDelegateModel,
    parseOptionAsStrings,
    PluginError,
    requireOption,
    resolvePath,
    RUNTIME_PACKAGE,
    saveProject,
    type PluginOptions,
} from '@zenstackhq/sdk';
import { DataModel, isDataModel, Model } from '@zenstackhq/sdk/ast';
import { getPrismaClientImportSpec, supportCreateMany, type DMMF } from '@zenstackhq/sdk/prisma';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { Project } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';
import { createClientHelperEntries, generateClientTypingForModel } from './client-helper';
import { project } from './project';
import {
    AllSupportedClientHelpers,
    generateHelperImport,
    generateProcedure,
    generateRouterSchemaImport,
    getInputSchemaByOpName,
    resolveModelsComments,
    SupportedClientHelpers,
} from './utils';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    // resolve "generateModels" option
    const generateModels = parseOptionAsStrings(options, 'generateModels', name);

    // resolve "generateModelActions" option
    const generateModelActions = parseOptionAsStrings(options, 'generateModelActions', name);

    // resolve "generateClientHelpers" option
    const generateClientHelpers = parseOptionAsStrings(options, 'generateClientHelpers', name);
    if (
        generateClientHelpers &&
        !generateClientHelpers.every((v) => AllSupportedClientHelpers.includes(v as SupportedClientHelpers))
    ) {
        throw new PluginError(
            name,
            `Option "generateClientHelpers" only supports the following values: ${AllSupportedClientHelpers.map(
                (n) => '"' + n + '"'
            ).join(', ')}.`
        );
    }

    if (options.zodSchemasImport && typeof options.zodSchemasImport !== 'string') {
        throw new PluginError(name, `Option "zodSchemasImport" must be a string`);
    }

    let outDir = requireOption<string>(options, 'output', name);
    outDir = resolvePath(outDir, options);
    ensureEmptyDir(outDir);

    const version = typeof options.version === 'string' ? options.version : 'v10';
    if (!['v10', 'v11'].includes(version)) {
        throw new PluginError(name, `Unsupported tRPC version "${version}". Use "v10" (default) or "v11".`);
    }

    if (version === 'v11') {
        // v11 require options for importing `createTRPCRouter` and `procedure`
        const importCreateRouter = options.importCreateRouter as string;
        if (!importCreateRouter) {
            throw new PluginError(name, `Option "importCreateRouter" is required for tRPC v11`);
        }

        const importProcedure = options.importProcedure as string;
        if (!importProcedure) {
            throw new PluginError(name, `Option "importProcedure" is required for tRPC v11`);
        }
    }

    const prismaClientDmmf = dmmf;

    let modelOperations = prismaClientDmmf.mappings.modelOperations;
    if (generateModels) {
        modelOperations = modelOperations.filter((mo) => generateModels.includes(mo.model));
    }

    // TODO: remove this legacy code that deals with "@Gen.hide" comment syntax inherited
    // from original code
    const hiddenModels: string[] = [];
    resolveModelsComments(prismaClientDmmf.datamodel.models, hiddenModels);

    const zodSchemasImport = (options.zodSchemasImport as string) ?? '@zenstackhq/runtime/zod';
    createAppRouter(
        outDir,
        modelOperations,
        hiddenModels,
        generateModelActions,
        generateClientHelpers as SupportedClientHelpers[] | undefined,
        model,
        zodSchemasImport,
        options,
        version
    );

    createHelper(outDir);

    await saveProject(project);
}

function createAppRouter(
    outDir: string,
    modelOperations: readonly DMMF.ModelMapping[],
    hiddenModels: string[],
    generateModelActions: string[] | undefined,
    generateClientHelpers: SupportedClientHelpers[] | undefined,
    zmodel: Model,
    zodSchemasImport: string,
    options: PluginOptions,
    version: string
) {
    const indexFile = path.resolve(outDir, 'routers', `index.ts`);
    const appRouter = project.createSourceFile(indexFile, undefined, {
        overwrite: true,
    });

    appRouter.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(path.dirname(indexFile), options);

    if (version === 'v10') {
        appRouter.addImportDeclarations([
            {
                namedImports: [
                    'unsetMarker',
                    'AnyRouter',
                    'AnyRootConfig',
                    'CreateRouterInner',
                    'Procedure',
                    'ProcedureBuilder',
                    'ProcedureParams',
                    'ProcedureRouterRecord',
                    'ProcedureType',
                ],
                isTypeOnly: true,
                moduleSpecifier: '@trpc/server',
            },
        ]);
    } else {
        appRouter.addImportDeclarations([
            {
                namedImports: ['AnyTRPCRouter as AnyRouter'],
                isTypeOnly: true,
                moduleSpecifier: '@trpc/server',
            },
        ]);
    }

    appRouter.addImportDeclarations([
        {
            namedImports: ['PrismaClient'],
            isTypeOnly: true,
            moduleSpecifier: prismaImport,
        },
    ]);

    if (version === 'v10') {
        appRouter.addStatements(`
        export type BaseConfig = AnyRootConfig;

        export type RouterFactory<Config extends BaseConfig> = <
            ProcRouterRecord extends ProcedureRouterRecord
        >(
            procedures: ProcRouterRecord
        ) => CreateRouterInner<Config, ProcRouterRecord>;
            
        export type UnsetMarker = typeof unsetMarker;

        export type ProcBuilder<Config extends BaseConfig> = ProcedureBuilder<
            ProcedureParams<Config, any, any, any, UnsetMarker, UnsetMarker, any>
        >;            
        `);
    } else {
        appRouter.addImportDeclaration({
            namedImports: ['createTRPCRouter'],
            moduleSpecifier: options.importCreateRouter as string,
        });
    }

    appRouter.addStatements(`
        export function db(ctx: any) {
            if (!ctx.prisma) {
                throw new Error('Missing "prisma" field in trpc context');
            }
            return ctx.prisma as PrismaClient;
        }
    `);

    const filteredModelOperations = modelOperations.filter((mo) => !hiddenModels.includes(mo.model));

    appRouter
        .addFunction({
            name: version === 'v10' ? 'createRouter<Config extends BaseConfig>' : 'createRouter',
            parameters:
                version === 'v10'
                    ? [
                          { name: 'router', type: 'RouterFactory<Config>' },
                          { name: 'procedure', type: 'ProcBuilder<Config>' },
                      ]
                    : [],
            isExported: true,
        })
        .setBodyText((writer) => {
            writer.write(`return ${version === 'v10' ? 'router' : 'createTRPCRouter'}(`);
            writer.block(() => {
                for (const modelOperation of filteredModelOperations) {
                    const { model, ...operations } = modelOperation;

                    // "count" operation is missing from Prisma DMMF, add it here
                    operations.count = `count${model}`;

                    generateModelCreateRouter(
                        project,
                        model,
                        operations,
                        outDir,
                        generateModelActions,
                        generateClientHelpers,
                        zodSchemasImport,
                        options,
                        zmodel,
                        version
                    );

                    appRouter.addImportDeclaration({
                        defaultImport: `create${model}Router`,
                        moduleSpecifier: `./${model}.router`,
                    });

                    if (version === 'v10') {
                        writer.writeLine(`${lowerCaseFirst(model)}: create${model}Router(router, procedure),`);
                    } else {
                        writer.writeLine(`${lowerCaseFirst(model)}: create${model}Router(),`);
                    }
                }
            });
            writer.write(');');
        });

    if (generateClientHelpers) {
        createClientHelperEntries(
            project,
            outDir,
            generateClientHelpers,
            filteredModelOperations.map(({ model }) => model),
            version
        );
    }

    appRouter.formatText();
}

function generateModelCreateRouter(
    project: Project,
    model: string,
    operations: Record<string, string | undefined | null>,
    outputDir: string,
    generateModelActions: string[] | undefined,
    generateClientHelpers: SupportedClientHelpers[] | undefined,
    zodSchemasImport: string,
    options: PluginOptions,
    zmodel: Model,
    version: string
) {
    const modelRouter = project.createSourceFile(path.resolve(outputDir, 'routers', `${model}.router.ts`), undefined, {
        overwrite: true,
    });

    modelRouter.addStatements('/* eslint-disable */');

    if (version === 'v10') {
        modelRouter.addImportDeclarations([
            {
                namedImports: ['type RouterFactory', 'type ProcBuilder', 'type BaseConfig', 'db'],
                moduleSpecifier: '.',
            },
        ]);
    } else {
        modelRouter.addImportDeclarations([
            {
                namedImports: ['db'],
                moduleSpecifier: '.',
            },
        ]);

        modelRouter.addImportDeclarations([
            {
                namedImports: ['createTRPCRouter'],
                moduleSpecifier: options.importCreateRouter as string,
            },
        ]);

        modelRouter.addImportDeclarations([
            {
                namedImports: ['procedure'],
                moduleSpecifier: options.importProcedure as string,
            },
        ]);
    }

    // zod schema import
    generateRouterSchemaImport(modelRouter, zodSchemasImport);

    // runtime helpers
    generateHelperImport(modelRouter);

    const createRouterFunc =
        version === 'v10'
            ? modelRouter.addFunction({
                  name: 'createRouter<Config extends BaseConfig>',
                  parameters: [
                      { name: 'router', type: 'RouterFactory<Config>' },
                      { name: 'procedure', type: 'ProcBuilder<Config>' },
                  ],
                  isExported: true,
                  isDefaultExport: true,
              })
            : modelRouter.addFunction({
                  name: 'createRouter',
                  isExported: true,
                  isDefaultExport: true,
              });

    const dataModel = zmodel.declarations.find((d): d is DataModel => isDataModel(d) && d.name === model);
    if (!dataModel) {
        throw new Error(`Data model "${model}" not found`);
    }

    const generateOperations: Array<{ name: string; baseType: string }> = [];

    createRouterFunc.setBodyText((funcWriter) => {
        funcWriter.write(`return ${version === 'v10' ? 'router' : 'createTRPCRouter'}(`);
        funcWriter.block(() => {
            for (const [opType, opNameWithModel] of Object.entries(operations)) {
                if (isDelegateModel(dataModel) && (opType.startsWith('create') || opType.startsWith('upsert'))) {
                    // delete models don't support create or upsert operations
                    continue;
                }

                const baseOpType = opType.replace('OrThrow', '');
                const inputType = getInputSchemaByOpName(baseOpType, model);
                const generateOpName = opType.replace(/One$/, '');

                if (
                    opNameWithModel &&
                    inputType &&
                    (!generateModelActions || generateModelActions.includes(generateOpName))
                ) {
                    if (generateOpName === 'createMany' && !supportCreateMany(zmodel)) {
                        continue;
                    }

                    generateProcedure(funcWriter, generateOpName, upperCaseFirst(inputType), model, baseOpType);
                    generateOperations.push({ name: generateOpName, baseType: baseOpType });
                }
            }
        });
        funcWriter.write(');');
    });

    if (generateClientHelpers) {
        generateClientTypingForModel(
            project,
            generateClientHelpers,
            model,
            options,
            generateOperations,
            version,
            outputDir
        );
    }

    modelRouter.formatText();
}

function createHelper(outDir: string) {
    const sf = project.createSourceFile(path.resolve(outDir, 'helper.ts'), undefined, {
        overwrite: true,
    });

    sf.addStatements('/* eslint-disable */');
    sf.addStatements(`import { TRPCError } from '@trpc/server';`);
    sf.addStatements(`import { isPrismaClientKnownRequestError } from '${RUNTIME_PACKAGE}';`);

    const checkMutate = sf.addFunction({
        name: 'checkMutate',
        typeParameters: [{ name: 'T' }],
        parameters: [
            {
                name: 'promise',
                type: 'Promise<T>',
            },
        ],
        isAsync: true,
        isExported: true,
        returnType: 'Promise<T | undefined>',
    });

    checkMutate.setBodyText(
        `try {
            return await promise;
        } catch (err: any) {
            if (isPrismaClientKnownRequestError(err)) {
                if (err.code === 'P2004') {
                    if (err.meta?.reason === '${CrudFailureReason.RESULT_NOT_READABLE}') {
                        // unable to readback data
                        return undefined;
                    } else {
                        // rejected by policy
                        throw new TRPCError({
                            code: 'FORBIDDEN',
                            message: err.message,
                            cause: err,
                        });
                    }
                } else {
                    // request error
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: err.message,
                        cause: err,
                    });
                }
            } else {
                throw err;
            }
        }
    `
    );
    checkMutate.formatText();

    const checkRead = sf.addFunction({
        name: 'checkRead',
        typeParameters: [{ name: 'T' }],
        parameters: [
            {
                name: 'promise',
                type: 'Promise<T>',
            },
        ],
        isAsync: true,
        isExported: true,
        returnType: 'Promise<T>',
    });

    checkRead.setBodyText(
        `try {
            return await promise;
        } catch (err: any) {
            if (isPrismaClientKnownRequestError(err)) {
                if (err.code === 'P2004') {
                    // rejected by policy
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: err.message,
                        cause: err,
                    });
                } else if (err.code === 'P2025') {
                    // not found
                    throw new TRPCError({
                        code: 'NOT_FOUND',
                        message: err.message,
                        cause: err,
                    });
                } else {
                    // request error
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: err.message,
                        cause: err,
                    })
                }
            } else {
                throw err;
            }
        }
    `
    );
    checkRead.formatText();
}
