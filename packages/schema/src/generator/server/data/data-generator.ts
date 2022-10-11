import { Context, GeneratorError } from '../../types';
import {
    CodeBlockWriter,
    OptionalKind,
    ParameterDeclarationStructure,
    Project,
    SourceFile,
    VariableDeclarationKind,
} from 'ts-morph';
import {
    DataModel,
    Expression,
    isInvocationExpr,
    isLiteralExpr,
} from '@lang/generated/ast';
import * as path from 'path';
import { camelCase, paramCase } from 'change-case';
import { extractDataModelsWithAllowRules } from '../../utils';
import { ServerCodeGenerator } from '../server-code-generator';
import ExpressionWriter from './expression-writer';
import { streamAllContents } from 'langium';
import colors from 'colors';

type ServerOperation = 'get' | 'create' | 'find' | 'update' | 'del';
type PolicyAction = 'create' | 'read' | 'update' | 'delete';

export default class DataServerGenerator implements ServerCodeGenerator {
    generate(project: Project, context: Context): void {
        const models = extractDataModelsWithAllowRules(context.schema);
        this.generateIndex(models, project, context);
        this.generateUtils(project, context);
        models.forEach((model) =>
            this.generateForModel(model, project, context)
        );

        console.log(colors.blue('  ✔️ Server-side CRUD generated'));
    }

    //#region Index & Utils

    private generateIndex(
        models: DataModel[],
        project: Project,
        context: Context
    ) {
        const content = `
        import type { NextApiRequest, NextApiResponse } from 'next';
        import { RequestHandlerOptions } from '..';
        ${models.map((model) => this.writeModelImport(model)).join('\n')}    
        
        export default async function (
            req: NextApiRequest,
            res: NextApiResponse,
            path: string[],
            options: RequestHandlerOptions
        ) {
            const [type, ...rest] = path;
            switch (type) {
                ${models
                    .map((model) => this.writeModelEntrance(model))
                    .join('\n')}
                default:
                    res.status(404).json({ error: 'Unknown type: ' + type });
            }
        }
        `;
        const sf = project.createSourceFile(
            path.join(context.outDir, 'server/data/index.ts'),
            content,
            { overwrite: true }
        );
        sf.formatText();
    }

    private generateUtils(project: Project, context: Context) {
        const content = `
        import type { NextApiRequest, NextApiResponse } from 'next';
        import { RequestHandlerOptions } from '..';
        
        export async function getUser(
            req: NextApiRequest,
            res: NextApiResponse,
            options: RequestHandlerOptions
        ) {
            return await options.getServerUser(req, res);
        }
        
        export function unauthorized(res: NextApiResponse) {
            res.status(403).json({ message: 'Unauthorized' });
        }

        export function notFound(res: NextApiResponse) {
            res.status(404).json({ message: 'Entity not found' });
        }
        `;
        const sf = project.createSourceFile(
            path.join(context.outDir, 'server/data/_utils.ts'),
            content,
            { overwrite: true }
        );
        sf.formatText();
    }

    private writeModelImport(model: DataModel) {
        return `import ${camelCase(model.name)}Handler from './${paramCase(
            model.name
        )}';`;
    }

    private writeModelEntrance(model: DataModel) {
        return `
            case '${camelCase(model.name)}':
                return ${camelCase(model.name)}Handler(req, res, rest, options);
        `;
    }

    //#endregion

    //#region Per-Model

    private generateForModel(
        model: DataModel,
        project: Project,
        context: Context
    ) {
        const content = `
        import type { NextApiRequest, NextApiResponse } from 'next';
        import type { Prisma as P } from '@zenstack/.prisma';
        import { RequestHandlerOptions } from '..';
        import service from '@zenstack/service';
        import { getUser, notFound } from './_utils';
    
        export default async function (
            req: NextApiRequest,
            res: NextApiResponse,
            path: string[],
            options: RequestHandlerOptions
        ) {
            switch (req.method) {
                case 'GET':
                    if (path.length > 0) {
                        return get(req, res, path[0], options);
                    } else {
                        return find(req, res, options);
                    }
        
                case 'POST':
                    return create(req, res, options);
        
                case 'PUT':
                    return update(req, res, path[0], options);
        
                case 'DELETE':
                    return del(req, res, path[0], options);
    
                default:
                    throw new Error('Unsupported HTTP method: ' + req.method);
            }
        }
        `;
        const sf = project.createSourceFile(
            path.join(
                context.outDir,
                `server/data/${paramCase(model.name)}.ts`
            ),
            content,
            { overwrite: true }
        );

        this.generateFind(sf, model);
        this.generateGet(sf, model);
        this.generateCreate(sf, model);
        this.generateUpdate(sf, model);
        this.generateDel(sf, model);

        sf.formatText();
        sf.saveSync();
    }

    private generateServeFunction(
        sourceFile: SourceFile,
        model: DataModel,
        operation: ServerOperation
    ) {
        const parameters: OptionalKind<ParameterDeclarationStructure>[] = [];

        parameters.push({
            name: 'req',
            type: 'NextApiRequest',
        });

        parameters.push({
            name: 'res',
            type: 'NextApiResponse',
        });

        if (
            operation === 'get' ||
            operation === 'update' ||
            operation === 'del'
        ) {
            // an extra "id" parameter
            parameters.push({
                name: 'id',
                type: 'string',
            });
        }

        parameters.push({
            name: 'options',
            type: 'RequestHandlerOptions',
        });

        const func = sourceFile
            .addFunction({
                name: operation,
                isAsync: true,
                parameters,
            })
            .addBody();

        if (this.modelUsesAuth(model)) {
            func.addStatements([
                `const user = await getUser(req, res, options);`,
            ]);
        }
        return func;
    }

    private modelUsesAuth(model: DataModel) {
        return !!streamAllContents(model).find(
            (node) =>
                isInvocationExpr(node) && node.function.ref?.name === 'auth'
        );
    }

    //#region Find & Get

    private generateFind(sourceFile: SourceFile, model: DataModel) {
        const func = this.generateServeFunction(sourceFile, model, 'find');

        func.addStatements([
            `const query: P.${model.name}FindManyArgs = req.query.q? (JSON.parse(req.query.q as string)): {};`,
        ]);

        func.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'args',
                    type: `P.${model.name}FindManyArgs`,
                    initializer: (writer) => {
                        writer.block(() => {
                            writer.writeLine('...query,');
                            writer.write('where:');
                            writer.block(() => {
                                writer.write('AND: [');
                                writer.write('{ ...query.where },');
                                this.writeFindArgs(writer, model, 'read');
                                writer.write(']');
                            });
                        });
                    },
                },
            ],
        });

        func.addStatements([
            `res.status(200).send(await service.db.${camelCase(
                model.name
            )}.findMany(args));`,
        ]);
    }

    private generateGet(sourceFile: SourceFile, model: DataModel) {
        const func = this.generateServeFunction(sourceFile, model, 'get');

        func.addStatements([
            `const query: P.${model.name}FindFirstArgs = req.query.q? (JSON.parse(req.query.q as string)): {};`,
        ]);

        func.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'args',
                    type: `P.${model.name}FindFirstArgs`,
                    initializer: (writer) => {
                        writer.block(() => {
                            writer.writeLine('...query,');
                            writer.write('where:');
                            writer.block(() => {
                                writer.write('AND: [');
                                writer.write('{ id },');
                                this.writeFindArgs(writer, model, 'read');
                                writer.write(']');
                            });
                        });
                    },
                },
            ],
        });

        func.addStatements([
            `
            const r = await service.db.${camelCase(model.name)}.findFirst(args);
            if (!r) {
                notFound(res);
            } else {
                res.status(200).send(r);
            }
            `,
        ]);
    }

    private writeFindArgs(
        writer: CodeBlockWriter,
        model: DataModel,
        action: PolicyAction
    ) {
        writer.block(() => {
            writer.writeLine('AND: [');
            this.writeDenyRules(writer, model, action);
            this.writeAllowRules(writer, model, action);
            writer.writeLine(']');
        });
    }

    //#endregion

    //#region Create

    private generateCreate(sourceFile: SourceFile, model: DataModel) {
        const func = this.generateServeFunction(sourceFile, model, 'create');

        func.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'args',
                    type: `P.${model.name}CreateArgs`,
                    initializer: 'req.body',
                },
            ],
        });

        // TODO: policy

        func.addStatements([
            `
            const r = await service.db.${camelCase(model.name)}.create(args);
            res.status(200).send(r);
            `,
        ]);
    }

    //#endregion

    //#region Update

    private generateUpdate(sourceFile: SourceFile, model: DataModel) {
        const func = this.generateServeFunction(sourceFile, model, 'update');

        func.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'body',
                    type: `P.${model.name}UpdateArgs`,
                    initializer: 'req.body',
                },
            ],
        });

        // TODO: policy

        func.addStatements([
            `
            const r = await service.db.${camelCase(model.name)}.update({
                ...body,
                where: { id }
            });
            res.status(200).send(r);
            `,
        ]);
    }

    //#endregion

    //#region Delete

    private generateDel(sourceFile: SourceFile, model: DataModel) {
        const func = this.generateServeFunction(sourceFile, model, 'del');

        func.addStatements([
            `const args: P.${model.name}DeleteArgs = req.query.q? (JSON.parse(req.query.q as string)): {};`,
        ]);

        // TODO: policy

        func.addStatements([
            `
            const r = await service.db.${camelCase(model.name)}.delete({
                ...args,
                where: { id }
            });
            res.status(200).send(r);
            `,
        ]);
    }

    //#endregion

    //#endregion

    //#region Policy

    private ruleSpecCovers(ruleSpec: Expression, action: string) {
        if (!isLiteralExpr(ruleSpec) || typeof ruleSpec.value !== 'string') {
            throw new GeneratorError(`Rule spec must be a string literal`);
        }

        const specs = ruleSpec.value.split(',').map((s) => s.trim());
        return specs.includes('all') || specs.includes(action);
    }

    private writeDenyRules(
        writer: CodeBlockWriter,
        model: DataModel,
        action: PolicyAction
    ) {
        const attrs = model.attributes.filter(
            (attr) =>
                attr.args.length > 0 &&
                attr.decl.ref?.name === 'deny' &&
                attr.args.length > 1 &&
                this.ruleSpecCovers(attr.args[0].value, action)
        );
        attrs.forEach((attr) =>
            this.writeDenyRule(writer, model, attr.args[1].value)
        );
    }

    private writeDenyRule(
        writer: CodeBlockWriter,
        model: DataModel,
        rule: Expression
    ) {
        writer.block(() => {
            writer.writeLine('NOT: ');
            new ExpressionWriter(writer).write(rule);
        });
        writer.write(',');
    }

    private writeAllowRules(
        writer: CodeBlockWriter,
        model: DataModel,
        action: PolicyAction
    ) {
        const attrs = model.attributes.filter(
            (attr) =>
                attr.args.length > 0 &&
                attr.decl.ref?.name === 'allow' &&
                attr.args.length > 1 &&
                this.ruleSpecCovers(attr.args[0].value, action)
        );
        attrs.forEach((attr) =>
            this.writeAllowRule(writer, model, attr.args[1].value)
        );
    }

    private writeAllowRule(
        writer: CodeBlockWriter,
        model: DataModel,
        rule: Expression
    ) {
        new ExpressionWriter(writer).write(rule);
        writer.write(',');
    }

    //#endregion
}
