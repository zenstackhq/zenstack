import { DMMF } from '@prisma/generator-helper';
import {
    CrudFailureReason,
    PluginError,
    PluginOptions,
    RUNTIME_PACKAGE,
    getPrismaClientImportSpec,
    requireOption,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import fs from 'fs';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { InterfaceDeclarationStructure, Project, PropertySignatureStructure, StructureKind } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';
import {
    generateHelperImport,
    generateProcedure,
    generateRouterSchemaImports,
    generateRouterTyping,
    generateRouterTypingImports,
    getInputSchemaByOpName,
    resolveModelsComments,
} from './helpers';
import { project } from './project';
import removeDir from './utils/removeDir';
// import { generate as PrismaZodGenerator } from './zod/generator';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output');
    outDir = resolvePath(outDir, options);

    // resolve "generateModelActions" option
    const generateModelActions = parseOptionAsStrings(options, 'generateModelActions');

    // resolve "generateClientHelpers" option
    const generateClientHelpers = parseOptionAsStrings(options, 'generateClientHelpers');
    if (generateClientHelpers && !generateClientHelpers.every((v) => ['react', 'next'].includes(v))) {
        throw new PluginError(name, `Option "generateClientHelpers" only support values "react" and "next"`);
    }

    await fs.promises.mkdir(outDir, { recursive: true });
    await removeDir(outDir, true);

    // await PrismaZodGenerator(model, options, dmmf);

    const prismaClientDmmf = dmmf;

    const modelOperations = prismaClientDmmf.mappings.modelOperations;
    const models = prismaClientDmmf.datamodel.models;
    const hiddenModels: string[] = [];
    resolveModelsComments(models, hiddenModels);

    createAppRouter(outDir, modelOperations, hiddenModels, generateModelActions, generateClientHelpers, model);
    createHelper(outDir);

    await saveProject(project);
}

function createAppRouter(
    outDir: string,
    modelOperations: DMMF.ModelMapping[],
    hiddenModels: string[],
    generateModelActions: string[] | undefined,
    generateClientHelpers: string[] | undefined,
    zmodel: Model
) {
    const indexFile = path.resolve(outDir, 'routers', `index.ts`);
    const appRouter = project.createSourceFile(indexFile, undefined, {
        overwrite: true,
    });

    appRouter.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(zmodel, path.dirname(indexFile));
    appRouter.addImportDeclarations([
        {
            namedImports: ['AnyRootConfig'],
            moduleSpecifier: '@trpc/server',
        },
        {
            namedImports: ['PrismaClient'],
            moduleSpecifier: prismaImport,
        },
        {
            namedImports: ['createRouterFactory', 'AnyRouter'],
            moduleSpecifier: '@trpc/server/dist/core/router',
        },
        {
            namedImports: ['createBuilder'],
            moduleSpecifier: '@trpc/server/dist/core/internals/procedureBuilder',
        },
    ]);

    appRouter.addStatements(`
        export type BaseConfig = AnyRootConfig;

        export type RouterFactory<Config extends BaseConfig> = ReturnType<
            typeof createRouterFactory<Config>
        >;
        
        export type ProcBuilder<Config extends BaseConfig> = ReturnType<
            typeof createBuilder<Config>
        >;
        
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
            name: 'createRouter<Config extends BaseConfig>',
            parameters: [
                { name: 'router', type: 'RouterFactory<Config>' },
                { name: 'procedure', type: 'ProcBuilder<Config>' },
            ],
            isExported: true,
        })
        .setBodyText((writer) => {
            writer.write('return router(');
            writer.block(() => {
                for (const modelOperation of filteredModelOperations) {
                    const { model, ...operations } = modelOperation;
                    generateModelCreateRouter(
                        project,
                        model,
                        operations,
                        outDir,
                        generateModelActions,
                        generateClientHelpers,
                        zmodel
                    );

                    appRouter.addImportDeclaration({
                        defaultImport: `create${model}Router`,
                        moduleSpecifier: `./${model}.router`,
                    });

                    writer.writeLine(`${lowerCaseFirst(model)}: create${model}Router<Config>(router, procedure),`);
                }
            });
            writer.write(');');
        });

    if (generateClientHelpers) {
        appRouter.addInterface({
            name: 'ClientType',
            typeParameters: ['AppRouter extends AnyRouter'],
            isExported: true,
            properties: filteredModelOperations.map(({ model }) => {
                appRouter.addImportDeclaration({
                    namedImports: [{ name: 'ClientType', alias: `${upperCaseFirst(model)}ClientType` }],
                    moduleSpecifier: `./${model}.router`,
                });
                return {
                    name: lowerCaseFirst(model),
                    type: `${upperCaseFirst(model)}ClientType<AppRouter>`,
                } as PropertySignatureStructure;
            }),
        });

        createClientHelpers(outDir, generateClientHelpers);
    }

    appRouter.formatText();
}

function createClientHelpers(outputDir: string, generateClientHelpers: string[]) {
    const utils = project.createSourceFile(path.resolve(outputDir, 'client', `utils.ts`), undefined, {
        overwrite: true,
    });
    utils.replaceWithText(fs.readFileSync(path.join(__dirname, './res/client/utils.ts'), 'utf-8'));

    for (const client of generateClientHelpers) {
        switch (client) {
            case 'react': {
                const content = fs.readFileSync(path.join(__dirname, './res/client/react.ts'), 'utf-8');
                project.createSourceFile(path.resolve(outputDir, 'client', 'react.ts'), content, {
                    overwrite: true,
                });
                break;
            }

            case 'next': {
                const content = fs.readFileSync(path.join(__dirname, './res/client/next.ts'), 'utf-8');
                project.createSourceFile(path.resolve(outputDir, 'client', 'next.ts'), content, { overwrite: true });
                break;
            }
        }
    }
}

function generateModelCreateRouter(
    project: Project,
    model: string,
    operations: Record<string, string | undefined | null>,
    outputDir: string,
    generateModelActions: string[] | undefined,
    generateClientHelpers: string[] | undefined,
    zmodel: Model
) {
    const modelRouter = project.createSourceFile(path.resolve(outputDir, 'routers', `${model}.router.ts`), undefined, {
        overwrite: true,
    });

    modelRouter.addStatements('/* eslint-disable */');

    modelRouter.addImportDeclarations([
        {
            namedImports: ['type RouterFactory', 'type ProcBuilder', 'type BaseConfig', 'db'],
            moduleSpecifier: '.',
        },
    ]);

    generateRouterSchemaImports(modelRouter, model);
    generateHelperImport(modelRouter);
    if (generateClientHelpers) {
        generateRouterTypingImports(modelRouter, zmodel);
    }

    const createRouterFunc = modelRouter.addFunction({
        name: 'createRouter<Config extends BaseConfig>',
        parameters: [
            { name: 'router', type: 'RouterFactory<Config>' },
            { name: 'procedure', type: 'ProcBuilder<Config>' },
        ],
        isExported: true,
        isDefaultExport: true,
    });

    let routerTypingStructure: InterfaceDeclarationStructure | undefined = undefined;
    if (generateClientHelpers) {
        // generate an interface for precise Prisma-like typing for the router procedures
        // which will be used to correct tRPC's typing on the client side
        routerTypingStructure = {
            kind: StructureKind.Interface,
            name: 'ClientType',
            isExported: true,
            typeParameters: ['AppRouter extends AnyRouter', `Context = AppRouter['_def']['_config']['$types']['ctx']`],
            properties: [] as PropertySignatureStructure[],
        };
    }

    createRouterFunc.setBodyText((funcWriter) => {
        funcWriter.write('return router(');
        funcWriter.block(() => {
            for (const [opType, opNameWithModel] of Object.entries(operations)) {
                const baseOpType = opType.replace('OrThrow', '');
                const inputType = getInputSchemaByOpName(baseOpType, model);
                const generateOpName = opType.replace(/One$/, '');

                if (
                    opNameWithModel &&
                    inputType &&
                    (!generateModelActions || generateModelActions.includes(generateOpName))
                ) {
                    generateProcedure(funcWriter, generateOpName, inputType, model, baseOpType);

                    if (routerTypingStructure) {
                        routerTypingStructure.properties?.push({
                            kind: StructureKind.PropertySignature,
                            name: generateOpName,
                            type: (writer) => {
                                generateRouterTyping(writer, generateOpName, model, baseOpType);
                            },
                        });
                    }
                }
            }
        });
        funcWriter.write(');');
    });

    if (routerTypingStructure) {
        modelRouter.addInterface(routerTypingStructure);
    }

    modelRouter.formatText();
}

function createHelper(outDir: string) {
    const sf = project.createSourceFile(path.resolve(outDir, 'helper.ts'), undefined, {
        overwrite: true,
    });

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

function parseOptionAsStrings(options: PluginOptions, optionaName: string) {
    const value = options[optionaName];
    if (value === undefined) {
        return undefined;
    } else if (typeof value === 'string') {
        // comma separated string
        return value
            .split(',')
            .filter((i) => !!i)
            .map((i) => i.trim());
    } else if (Array.isArray(value) && value.every((i) => typeof i === 'string')) {
        // string array
        return value as string[];
    } else {
        throw new PluginError(
            name,
            `Invalid "${optionaName}" option: must be a comma-separated string or an array of strings`
        );
    }
}
