import { Context, Generator } from '../types';
import { Project, StructureKind } from 'ts-morph';
import * as path from 'path';
import colors from 'colors';

export default class ServiceGenerator implements Generator {
    async generate(context: Context) {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(context.outDir, 'service.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: ['PrismaClient'],
            moduleSpecifier: './.prisma',
        });

        const cls = sf.addClass({
            name: 'ZenStackService',
            isExported: true,
        });
        cls.addMember({
            kind: StructureKind.Property,
            name: 'private readonly _prisma',
            initializer: 'new PrismaClient()',
        });

        cls.addGetAccessor({
            name: 'prisma',
        })
            .addBody()
            .setBodyText('return this._prisma;');

        sf.addStatements(['export default new ZenStackService();']);

        sf.formatText();
        await project.save();

        console.log(colors.blue(`  ✔️ ZenStack service generated`));
    }
}
