import { DMMF } from '@prisma/generator-helper';
import {
    CrudFailureReason,
    PluginOptions,
    RUNTIME_PACKAGE,
    requireOption,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { promises as fs } from 'fs';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { Project } from 'ts-morph';
import {
    generateHelperImport,
    generateProcedure,
    generateRouterSchemaImports,
    getInputTypeByOpName,
    resolveModelsComments,
} from './helpers';
import { project } from './project';
import removeDir from './utils/removeDir';
import { generate as PrismaZodGenerator } from './zod/generator';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output');
    outDir = resolvePath(outDir, options);

    await fs.mkdir(outDir, { recursive: true });
    await removeDir(outDir, true);

    await PrismaZodGenerator(model, options, dmmf);

    const prismaClientDmmf = dmmf;

    const modelOperations = prismaClientDmmf.mappings.modelOperations;
    const models = prismaClientDmmf.datamodel.models;
    const hiddenModels: string[] = [];
    resolveModelsComments(models, hiddenModels);

    createAppRouter(outDir, modelOperations, hiddenModels);
    createHelper(outDir);

    await saveProject(project);
}

function createAppRouter(outDir: string, modelOperations: DMMF.ModelMapping[], hiddenModels: string[]) {
    const appRouter = project.createSourceFile(path.resolve(outDir, 'routers', `index.ts`), undefined, {
        overwrite: true,
    });

    appRouter.addStatements('/* eslint-disable */');

    appRouter.addImportDeclarations([
        {
            namedImports: ['AnyRootConfig'],
            moduleSpecifier: '@trpc/server',
        },
        {
            namedImports: ['PrismaClient'],
            moduleSpecifier: '@prisma/client',
        },
        {
            namedImports: ['createRouterFactory'],
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

    const createFunction = appRouter.addFunction({
        name: 'createRouter<Config extends BaseConfig>',
        parameters: [
            { name: 'router', type: 'RouterFactory<Config>' },
            { name: 'procedure', type: 'ProcBuilder<Config>' },
        ],
        isExported: true,
    });

    createFunction.setBodyText((writer) => {
        writer.write('return router(');
        writer.block(() => {
            for (const modelOperation of modelOperations) {
                const { model, ...operations } = modelOperation;
                if (hiddenModels.includes(model)) {
                    continue;
                }

                generateModelCreateRouter(project, model, operations, outDir);

                appRouter.addImportDeclaration({
                    defaultImport: `create${model}Router`,
                    moduleSpecifier: `./${model}.router`,
                });

                writer.writeLine(`${lowerCaseFirst(model)}: create${model}Router<Config>(router, procedure),`);
            }
        });
        writer.write(');');
    });

    appRouter.formatText();
}

function generateModelCreateRouter(
    project: Project,
    model: string,
    operations: Record<string, string | undefined | null>,
    outputDir: string
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

    modelRouter
        .addFunction({
            name: 'createRouter<Config extends BaseConfig>',
            parameters: [
                { name: 'router', type: 'RouterFactory<Config>' },
                { name: 'procedure', type: 'ProcBuilder<Config>' },
            ],
            isExported: true,
            isDefaultExport: true,
        })
        .setBodyText((writer) => {
            writer.write('return router(');
            writer.block(() => {
                for (const [opType, opNameWithModel] of Object.entries(operations)) {
                    const baseOpType = opType.replace('OrThrow', '');

                    const inputType = getInputTypeByOpName(baseOpType, model);

                    if (opNameWithModel && inputType) {
                        generateProcedure(writer, opType.replace(/One$/, ''), inputType, model, baseOpType);
                    }
                }
            });
            writer.write(');');
        });

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
