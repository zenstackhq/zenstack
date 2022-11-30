import { DataModel, isDataModel } from '@lang/generated/ast';
import { camelCase } from 'change-case';
import colors from 'colors';
import * as path from 'path';
import { Project } from 'ts-morph';
import { RUNTIME_PACKAGE } from '../constants';
import { Context, Generator } from '../types';

/**
 * Generates ZenStack service code
 */
export default class ServiceGenerator implements Generator {
    get name() {
        return 'service';
    }

    async generate(context: Context): Promise<void> {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(context.generatedCodeDir, 'src/index.ts'),
            undefined,
            { overwrite: true }
        );

        const models = context.schema.declarations.filter((d): d is DataModel =>
            isDataModel(d)
        );

        sf.addStatements([
            `import { Prisma as P, PrismaClient } from "../.prisma";`,
            `import { DefaultService } from "${RUNTIME_PACKAGE}/lib/service";`,
            `import { CRUD } from "${RUNTIME_PACKAGE}/lib/handler/data/crud";`,
            `import type { QueryContext } from "${RUNTIME_PACKAGE}/lib/types";`,
            `import type { ${models
                .map((m) => m.name)
                .join(', ')} } from "../.prisma";`,
        ]);

        const cls = sf.addClass({
            name: 'ZenStackService',
            isExported: true,
            extends: 'DefaultService<PrismaClient>',
        });

        cls.addProperty({
            name: 'private crud',
            initializer: `new CRUD<PrismaClient>(this)`,
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

        cls.addMethod({
            name: 'loadFieldConstraintModule',
            isAsync: true,
        }).setBodyText(`
            return import('./field-constraint');
        `);

        // server-side CRUD operations per model
        for (const model of models) {
            cls.addGetAccessor({
                name: camelCase(model.name),
            }).setBodyText(`
                return {
                    get: <T extends P.${model.name}FindFirstArgs>(context: QueryContext, id: string, args?: P.SelectSubset<T, P.Subset<P.${model.name}FindFirstArgs, 'select' | 'include'>>) => 
                        this.crud.get('${model.name}', id, args, context) as Promise<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>,
                    find: <T extends P.${model.name}FindManyArgs>(context: QueryContext, args?: P.SelectSubset<T, P.${model.name}FindManyArgs>) => 
                        this.crud.find('${model.name}', args, context) as Promise<P.CheckSelect<T, Array<${model.name}>, Array<P.${model.name}GetPayload<T>>>>,
                    create: <T extends P.${model.name}CreateArgs>(context: QueryContext, args: P.${model.name}CreateArgs) => 
                        this.crud.create('${model.name}', args, context) as Promise<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>,
                    update: <T extends Omit<P.${model.name}UpdateArgs, 'where'>>(context: QueryContext, id: string, args: Omit<P.${model.name}UpdateArgs, 'where'>) => 
                        this.crud.update('${model.name}', id, args, context) as Promise<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>,
                    del: <T extends Omit<P.${model.name}DeleteArgs, 'where'>>(context: QueryContext, id: string, args?: Omit<P.${model.name}DeleteArgs, 'where'>) => 
                        this.crud.del('${model.name}', id, args, context) as Promise<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>,
                }
            `);
        }

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
