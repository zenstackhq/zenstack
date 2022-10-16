import { Context, Generator } from '../types';
import { Project, StructureKind, VariableDeclarationKind } from 'ts-morph';
import * as path from 'path';
import colors from 'colors';
import { INTERNAL_PACKAGE } from '../constants';

export default class ServiceGenerator implements Generator {
    async generate(context: Context) {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(context.generatedCodeDir, 'src/index.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: ['PrismaClient'],
            moduleSpecifier: '../.prisma',
        });

        sf.addImportDeclaration({
            namedImports: ['Service', 'PolicyOperationKind', 'QueryContext'],
            moduleSpecifier: INTERNAL_PACKAGE,
            isTypeOnly: true,
        });

        const cls = sf.addClass({
            name: 'ZenStackService',
            isExported: true,
            implements: ['Service<PrismaClient>'],
        });
        cls.addMember({
            kind: StructureKind.Property,
            name: 'private readonly _prisma',
            initializer: 'new PrismaClient()',
        });

        cls.addGetAccessor({
            name: 'db',
        })
            .addBody()
            .setBodyText('return this._prisma;');

        sf.addVariableStatement({
            declarationKind: VariableDeclarationKind.Let,
            declarations: [
                {
                    name: 'guardModule',
                    type: 'any',
                },
            ],
        });
        cls
            .addMethod({
                name: 'resolveField',
                isAsync: true,
                parameters: [
                    {
                        name: 'model',
                        type: 'string',
                    },
                    {
                        name: 'field',
                        type: 'string',
                    },
                ],
            })
            .addBody().setBodyText(`
                if (!guardModule) {
                    guardModule = await import('./query/guard');
                }
                return guardModule._fieldMapping?.[model]?.[field];
            `);

        cls
            .addMethod({
                name: 'buildQueryGuard',
                isAsync: true,
                parameters: [
                    {
                        name: 'model',
                        type: 'string',
                    },
                    {
                        name: 'operation',
                        type: 'PolicyOperationKind',
                    },
                    {
                        name: 'context',
                        type: 'QueryContext',
                    },
                ],
            })
            .addBody().setBodyText(`
                const module: any = await import('./query/guard');
                const provider: (context: QueryContext) => any = module[model+ '_' + operation];
                return provider(context);
            `);

        sf.addStatements(['export default new ZenStackService();']);

        sf.formatText();
        await project.save();

        console.log(colors.blue(`  ✔️ ZenStack service generated`));
    }
}
