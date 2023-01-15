import { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { promises as fs } from 'fs';
import path from 'path';
import { generate as PrismaZodGenerator } from './zod/generator';
import { generateProcedure, generateRouterSchemaImports, getInputTypeByOpName, resolveModelsComments } from './helpers';
import { project } from './project';
import removeDir from './utils/removeDir';
import { camelCase } from 'change-case';
import { Project } from 'ts-morph';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    const outputDir = options.output as string;

    await fs.mkdir(outputDir, { recursive: true });
    await removeDir(outputDir, true);

    await PrismaZodGenerator(model, options, dmmf);

    const prismaClientDmmf = dmmf;

    const modelOperations = prismaClientDmmf.mappings.modelOperations;
    const models = prismaClientDmmf.datamodel.models;
    const hiddenModels: string[] = [];
    resolveModelsComments(models, hiddenModels);

    const appRouter = project.createSourceFile(path.resolve(outputDir, 'routers', `index.ts`), undefined, {
        overwrite: true,
    });

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

                generateModelCreateRouter(project, model, operations, outputDir);

                appRouter.addImportDeclaration({
                    defaultImport: `create${model}Router`,
                    moduleSpecifier: `./${model}.router`,
                });

                writer.writeLine(`${camelCase(model)}: create${model}Router<Config>(router, procedure),`);
            }
        });
        writer.write(');');
    });

    appRouter.formatText();
    await project.save();
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

    modelRouter.addImportDeclarations([
        {
            namedImports: ['type RouterFactory', 'type ProcBuilder', 'type BaseConfig', 'db'],
            moduleSpecifier: '.',
        },
    ]);

    generateRouterSchemaImports(modelRouter, model);

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
