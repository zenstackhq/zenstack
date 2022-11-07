import { Context, Generator } from '../types';
import { Project } from 'ts-morph';
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

        sf.addStatements([
            `import { PrismaClient } from "../.prisma";`,
            `import { DefaultService } from "${INTERNAL_PACKAGE}";`,
        ]);

        const cls = sf.addClass({
            name: 'ZenStackService',
            isExported: true,
            extends: 'DefaultService<PrismaClient>',
        });

        cls.addMethod({
            name: 'initializePrisma',
        }).setBodyText(`
            const logConfig = (this.config.log || [])
                .filter(item => typeof item === 'string' ? ['info', 'warn', 'error', 'query'].includes(item): ['info', 'warn', 'error', 'query'].includes(item.level));
            return new PrismaClient({log: logConfig as any });
        `);

        cls.addMethod({
            name: 'loadGuardModule',
            isAsync: true,
        }).setBodyText(`
            return import('./query/guard');
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
