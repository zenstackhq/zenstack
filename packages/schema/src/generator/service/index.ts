import { Context, Generator } from '../types';
import { Project, StructureKind, VariableDeclarationKind } from 'ts-morph';
import * as path from 'path';
import colors from 'colors';
import { INTERNAL_PACKAGE } from '../constants';

/**
 * Generates ZenStack service code
 */
export default class ServiceGenerator implements Generator {
    async generate(context: Context): Promise<void> {
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

        sf.addVariableStatement({
            declarationKind: VariableDeclarationKind.Let,
            declarations: [
                {
                    name: 'guardModule',
                    type: 'any',
                },
            ],
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

        // Recommended by Prisma for Next.js
        // https://www.prisma.io/docs/guides/database/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices#problem
        sf.addStatements([
            'declare global { var zenstackService: ZenStackService | undefined}',
            'const service = global.zenstackService || new ZenStackService();',
            'export default service;',
            `if (process.env.NODE_ENV !== 'production') global.zenstackService = service;`,
        ]);

        sf.formatText();
        await project.save();

        console.log(colors.blue(`  ✔️ ZenStack service generated`));
    }
}
