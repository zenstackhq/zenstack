import type { DMMF } from '@prisma/generator-helper';
import {
    CrudFailureReason,
    PluginError,
    PluginOptions,
    RUNTIME_PACKAGE,
    getPrismaClientImportSpec,
    parseOptionAsStrings,
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
    generateRouterSchemaImport,
    generateRouterTyping,
    generateRouterTypingImports,
    getInputSchemaByOpName,
    resolveModelsComments,
} from './helpers';
import { project } from './project';
import removeDir from './utils/removeDir';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let outDir = requireOption<string>(options, 'output', name);
    outDir = resolvePath(outDir, options);

    // resolve "generateModels" option
    const generateModels = parseOptionAsStrings(options, 'generateModels', name);

    // resolve "generateModelActions" option
    const generateModelActions = parseOptionAsStrings(options, 'generateModelActions', name);

    // resolve "generateClientHelpers" option
    const generateClientHelpers = parseOptionAsStrings(options, 'generateClientHelpers', name);
    if (generateClientHelpers && !generateClientHelpers.every((v) => ['react', 'next'].includes(v))) {
        throw new PluginError(name, `Option "generateClientHelpers" only support values "react" and "next"`);
    }

    if (options.zodSchemasImport && typeof options.zodSchemasImport !== 'string') {
        throw new PluginError(name, `Option "zodSchemasImport" must be a string`);
    }

    await fs.promises.mkdir(outDir, { recursive: true });
    await removeDir(outDir, true);

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
        generateClientHelpers,
        model,
        zodSchemasImport
    );
    createHelper(outDir);

    await saveProject(project);
}

function createAppRouter(
    outDir: string,
    modelOperations: DMMF.ModelMapping[],
    hiddenModels: string[],
    generateModelActions: string[] | undefined,
    generateClientHelpers: string[] | undefined,
    zmodel: Model,
    zodSchemasImport: string
) {
    const indexFile = path.resolve(outDir, 'routers', `index.ts`);
    const appRouter = project.createSourceFile(indexFile, undefined, {
        overwrite: true,
    });

    appRouter.addStatements('/* eslint-disable */');

    const prismaImport = getPrismaClientImportSpec(zmodel, path.dirname(indexFile));
    appRouter.addImportDeclarations([
        {
            namedImports: [
                'type AnyRouter',
                'type AnyRootConfig',
                'type CreateRouterInner',
                'type Procedure',
                'type ProcedureBuilder',
                'type ProcedureParams',
                'type ProcedureRouterRecord',
                'type ProcedureType',
            ],
            moduleSpecifier: '@trpc/server',
        },
        {
            namedImports: ['type PrismaClient', 'type Prisma'],
            moduleSpecifier: prismaImport,
        },
        { defaultImport: 'z', moduleSpecifier: 'zod', isTypeOnly: true },
    ]);

    appRouter.addStatements(`
        ${/** to be used by the other routers without making a bigger commit */ ''}
        export { PrismaClient } from '${prismaImport}'; 

        export type BaseConfig = AnyRootConfig;

        export type RouterFactory<Config extends BaseConfig> = <
            ProcRouterRecord extends ProcedureRouterRecord
        >(
            procedures: ProcRouterRecord
        ) => CreateRouterInner<Config, ProcRouterRecord>;
            
        ${
            /** this is needed in order to prevent type errors between a procedure and a middleware-extended procedure */ ''
        }
        export type ProcBuilder<Config extends BaseConfig> = ProcedureBuilder<{
            _config: Config;
            _ctx_out: Config['$types']['ctx'];
            _input_in: any;
            _input_out: any;
            _output_in: any;
            _output_out: any;
            _meta: Config['$types']['meta'];
        }>;

        type ExtractParamsFromProcBuilder<Builder extends ProcedureBuilder<any>> =
            Builder extends ProcedureBuilder<infer P> ? P : never;
        
        type FromPromise<P extends Promise<any>> = P extends Promise<infer T>
            ? T
            : never;
          
        ${/** workaround to avoid creating 'typeof unsetMarker & object' on the procedure output */ ''}
        type Join<A, B> = A extends symbol ? B : A & B;

        ${
            /** you can name it whatever you want, but this is to make sure that 
                the types from the middleware and the procedure are correctly merged */ ''
        }
        export type ProcReturns<
            PType extends ProcedureType,
            PBuilder extends ProcBuilder<BaseConfig>,
            ZType extends z.ZodType,
            PPromise extends Prisma.PrismaPromise<any>
        > = Procedure<
                PType,
                ProcedureParams<
                    ExtractParamsFromProcBuilder<PBuilder>["_config"],
                    ExtractParamsFromProcBuilder<PBuilder>["_ctx_out"],
                    Join<ExtractParamsFromProcBuilder<PBuilder>["_input_in"], z.infer<ZType>>,
                    Join<ExtractParamsFromProcBuilder<PBuilder>["_input_out"], z.infer<ZType>>,
                    Join<
                        ExtractParamsFromProcBuilder<PBuilder>["_output_in"],
                        FromPromise<PPromise>
                    >,
                    Join<
                        ExtractParamsFromProcBuilder<PBuilder>["_output_out"],
                        FromPromise<PPromise>
                    >,
                    ExtractParamsFromProcBuilder<PBuilder>["_meta"]
                >
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
            name: 'createRouter<Router extends RouterFactory<BaseConfig>, Proc extends ProcBuilder<BaseConfig>>',
            parameters: [
                { name: 'router', type: 'Router' },
                { name: 'procedure', type: 'Proc' },
            ],
            isExported: true,
        })
        .setBodyText((writer) => {
            writer.write('return router(');
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
                        zmodel,
                        zodSchemasImport
                    );

                    appRouter.addImportDeclaration({
                        defaultImport: `create${model}Router`,
                        moduleSpecifier: `./${model}.router`,
                    });

                    writer.writeLine(
                        `${lowerCaseFirst(model)}: create${model}Router<Router, Proc>(router, procedure),`
                    );
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
    zmodel: Model,
    zodSchemasImport: string
) {
    const modelRouter = project.createSourceFile(path.resolve(outputDir, 'routers', `${model}.router.ts`), undefined, {
        overwrite: true,
    });

    modelRouter.addStatements('/* eslint-disable */');

    modelRouter.addImportDeclarations([
        {
            namedImports: [
                'type RouterFactory',
                'type ProcBuilder',
                'type BaseConfig',
                'type ProcReturns',
                'type PrismaClient',
                'db',
            ],
            moduleSpecifier: '.',
        },
    ]);

    generateRouterSchemaImport(modelRouter, zodSchemasImport);
    generateHelperImport(modelRouter);
    if (generateClientHelpers) {
        generateRouterTypingImports(modelRouter, zmodel);
    }

    const createRouterFunc = modelRouter.addFunction({
        name: 'createRouter<Router extends RouterFactory<BaseConfig>, Proc extends ProcBuilder<BaseConfig>>',
        parameters: [
            { name: 'router', type: 'Router' },
            { name: 'procedure', type: 'Proc' },
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
                    generateProcedure(funcWriter, generateOpName, upperCaseFirst(inputType), model, baseOpType);

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
