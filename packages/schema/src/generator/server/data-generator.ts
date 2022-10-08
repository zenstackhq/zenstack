import { Context } from '../types';
import {
    CodeBlockWriter,
    Project,
    SourceFile,
    VariableDeclarationKind,
} from 'ts-morph';
import { DataModel, Expression } from '../../language-server/generated/ast';
import * as path from 'path';
import { camelCase, paramCase } from 'change-case';
import { extractDataModelsWithAllowRules } from '../utils';
import { ServerCodeGenerator } from './server-code-generator';
import ExpressionWriter from './expression-writer';

export default class DataServerGenerator implements ServerCodeGenerator {
    generate(project: Project, context: Context): void {
        const models = extractDataModelsWithAllowRules(context.schema);
        this.generateIndex(models, project, context);
        models.forEach((model) =>
            this.generateForModel(model, project, context)
        );
    }

    private generateIndex(
        models: DataModel[],
        project: Project,
        context: Context
    ) {
        const content = `
        import type { NextApiRequest, NextApiResponse } from 'next';
        import { RequestionHandlerOptions } from '..';
        ${models.map((model) => this.writeModelImport(model)).join('\n')}    
        
        export default async private (
            req: NextApiRequest,
            res: NextApiResponse,
            path: string[],
            options: RequestionHandlerOptions
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

    private generateForModel(
        model: DataModel,
        project: Project,
        context: Context
    ) {
        const content = `
        import type { NextApiRequest, NextApiResponse } from 'next';
        import { RequestionHandlerOptions } from '..';
        import service from '@zenstack/service';
    
        export default async private (
            req: NextApiRequest,
            res: NextApiResponse,
            path: string[],
            options: RequestionHandlerOptions
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

        sf.formatText();
    }

    private generateFind(sourceFile: SourceFile, model: DataModel) {
        const func = sourceFile
            .addFunction({
                name: 'find',
                isAsync: true,
                parameters: [
                    {
                        name: 'req',
                        type: 'NextApiRequest',
                    },
                    {
                        name: 'res',
                        type: 'NextApiResponse',
                    },
                    {
                        name: 'options',
                        type: 'RequestionHandlerOptions',
                    },
                ],
            })
            .addBody();

        func.addStatements([
            `const user = await getUser(req, res, options);`,
            `const condition = req.query.q? (JSON.parse(req.query.q as string) as ${model.name}FindArgsInput): null;`,
        ]);

        func.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'args',
                    type: 'TodoListFindArgsInput',
                    initializer: (writer) => this.writeFindArgs(writer, model),
                },
            ],
        });

        func.addStatements([
            `res.status(200).send(await service.prisma.todoList.findMany(args));`,
        ]);
    }

    private writeFindArgs(writer: CodeBlockWriter, model: DataModel) {
        writer.block(() => {
            writer.writeLine('where:');
            writer.block(() => {
                writer.indent(() => {
                    writer.writeLine('AND: [');

                    this.writeDenyRules(writer, model);
                    this.writeAllowRules(writer, model);

                    writer.writeLine(']');
                });
            });
        });
    }

    private writeDenyRules(writer: CodeBlockWriter, model: DataModel) {
        const attrs = model.attributes.filter(
            (attr) => attr.args.length > 0 && attr.decl.ref?.name === 'deny'
        );
        attrs.forEach((attr) =>
            this.writeDenyRule(writer, model, attr.args[0].value)
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
    }

    private writeAllowRules(writer: CodeBlockWriter, model: DataModel) {
        // throw new Error('private not implemented.');
    }
}
