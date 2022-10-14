import { Context, Generator } from '../types';
import { Project } from 'ts-morph';
import * as path from 'path';
import { paramCase } from 'change-case';
import { DataModel } from '@lang/generated/ast';
import colors from 'colors';
import { extractDataModelsWithAllowRules } from '../utils';
import { API_ROUTE_NAME, INTERNAL_PACKAGE } from '../constants';

export default class ReactHooksGenerator implements Generator {
    async generate(context: Context) {
        const project = new Project();

        const models = extractDataModelsWithAllowRules(context.schema);

        this.generateIndex(project, context, models);

        models.forEach((d) => this.generateModelHooks(project, context, d));

        await project.save();

        console.log(colors.blue('  ✔️ React hooks generated'));
    }

    private generateModelHooks(
        project: Project,
        context: Context,
        model: DataModel
    ) {
        const fileName = paramCase(model.name);
        const sf = project.createSourceFile(
            path.join(context.outDir, `src/hooks/${fileName}.ts`),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: [{ name: 'Prisma', alias: 'P' }, model.name],
            isTypeOnly: true,
            moduleSpecifier: '../../.prisma',
        });
        sf.addStatements(`import { request } from '${INTERNAL_PACKAGE}';`);

        sf.addStatements(
            `const endpoint = '/api/${API_ROUTE_NAME}/data/${model.name}';`
        );

        const useFuncBody = sf
            .addFunction({
                name: `use${model.name}`,
                isExported: true,
            })
            .addBody();

        useFuncBody.addStatements(['const mutate = request.getMutate();']);

        // create
        useFuncBody
            .addFunction({
                name: 'create',
                isAsync: true,
                typeParameters: [`T extends P.${model.name}CreateArgs`],
                parameters: [
                    { name: 'args', type: `P.${model.name}CreateArgs` },
                ],
            })
            .addBody()
            .addStatements([
                `return request.post<P.${model.name}CreateArgs, P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>(endpoint, args, mutate);`,
            ]);

        // find
        useFuncBody
            .addFunction({
                name: 'find',
                typeParameters: [`T extends P.${model.name}FindManyArgs`],
                parameters: [
                    {
                        name: 'args?',
                        type: `P.SelectSubset<T, P.${model.name}FindManyArgs>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<P.CheckSelect<T, Array<${model.name}>, Array<P.${model.name}GetPayload<T>>>>(endpoint, args);`,
            ]);

        // get
        useFuncBody
            .addFunction({
                name: 'get',
                typeParameters: [
                    `T extends P.Subset<P.${model.name}FindFirstArgs, 'select' | 'include'>`,
                ],
                parameters: [
                    {
                        name: 'id',
                        type: 'String',
                    },
                    {
                        name: 'args?',
                        type: `P.SelectSubset<T, P.Subset<P.${model.name}FindFirstArgs, 'select' | 'include'>>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>(id ? \`\${endpoint}/\${id}\`: null, args);`,
            ]);

        // update
        useFuncBody
            .addFunction({
                name: 'update',
                isAsync: true,
                typeParameters: [
                    `T extends Omit<P.${model.name}UpdateArgs, 'where'>`,
                ],
                parameters: [
                    { name: 'id', type: 'String' },
                    {
                        name: 'args',
                        type: `Omit<P.${model.name}UpdateArgs, 'where'>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.put<Omit<P.${model.name}UpdateArgs, 'where'>, P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>(\`\${endpoint}/\${id}\`, args, mutate);`,
            ]);

        // del
        useFuncBody
            .addFunction({
                name: 'del',
                isAsync: true,
                typeParameters: [
                    `T extends Omit<P.${model.name}DeleteArgs, 'where'>`,
                ],
                parameters: [
                    { name: 'id', type: 'String' },
                    {
                        name: 'args?',
                        type: `Omit<P.${model.name}DeleteArgs, 'where'>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.del<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>(\`\${endpoint}/\${id}\`, args, mutate);`,
            ]);

        useFuncBody.addStatements([
            'return { create, find, get, update, del };',
        ]);

        sf.formatText();
    }

    private generateIndex(
        project: Project,
        context: Context,
        models: DataModel[]
    ) {
        const sf = project.createSourceFile(
            path.join(context.outDir, 'src/hooks/index.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addStatements(
            models.map((d) => `export * from './${paramCase(d.name)}';`)
        );

        sf.formatText();
    }
}
