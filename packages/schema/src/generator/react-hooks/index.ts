import { Context, Generator } from '../types';
import { Project } from 'ts-morph';
import * as path from 'path';
import { paramCase } from 'change-case';
import { DataModel, isDataModel } from '@lang/generated/ast';
import colors from 'colors';
import { API_ROUTE_NAME, RUNTIME_PACKAGE } from '../constants';

/**
 * Generate react data query hooks code
 */
export default class ReactHooksGenerator implements Generator {
    get name() {
        return 'react-hooks';
    }

    async generate(context: Context): Promise<void> {
        const project = new Project();
        const models: DataModel[] = [];

        for (const model of context.schema.declarations.filter(
            (d): d is DataModel => isDataModel(d)
        )) {
            const hasAllowRule = model.attributes.find(
                (attr) => attr.decl.ref?.name === '@@allow'
            );
            if (!hasAllowRule) {
                console.warn(
                    colors.yellow(
                        `Not generating hooks for "${model.name}" because it doesn't have any @@allow rule`
                    )
                );
            } else {
                models.push(model);
            }
        }

        this.generateIndex(project, context, models);

        models.forEach((d) => this.generateModelHooks(project, context, d));

        await project.save();

        console.log(colors.blue('  ✔️ React hooks generated'));
    }

    private getValidator(model: DataModel, mode: 'create' | 'update') {
        return `${model.name}_${mode}_validator`;
    }

    private generateModelHooks(
        project: Project,
        context: Context,
        model: DataModel
    ) {
        const fileName = paramCase(model.name);
        const sf = project.createSourceFile(
            path.join(context.generatedCodeDir, `src/hooks/${fileName}.ts`),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: [{ name: 'Prisma', alias: 'P' }, model.name],
            isTypeOnly: true,
            moduleSpecifier: '../../.prisma',
        });
        sf.addStatements([
            `import * as request from '${RUNTIME_PACKAGE}/lib/request';`,
            `import { ServerErrorCode, RequestOptions } from '${RUNTIME_PACKAGE}/lib/types';`,
            `import { validate } from '${RUNTIME_PACKAGE}/lib/validation';`,
            `import { type SWRResponse } from 'swr';`,
            `import { ${this.getValidator(
                model,
                'create'
            )}, ${this.getValidator(
                model,
                'update'
            )} } from '../field-constraint';`,
        ]);

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
                `
                // validate field-level constraints
                validate(${this.getValidator(model, 'create')}, args.data);

                try {
                    return await request.post<P.${
                        model.name
                    }CreateArgs, P.CheckSelect<T, ${model.name}, P.${
                    model.name
                }GetPayload<T>>>(endpoint, args, mutate);
                } catch (err: any) {
                    if (err.info?.code === ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED) {
                        return undefined;
                    } else {
                        throw err;
                    }
                }
                `,
            ]);

        // find
        useFuncBody
            .addFunction({
                name: 'find',
                typeParameters: [`T extends P.${model.name}FindManyArgs`],
                returnType: `SWRResponse<P.CheckSelect<T, ${model.name}[], P.${model.name}GetPayload<T>[]>, any>`,
                parameters: [
                    {
                        name: 'args?',
                        type: `P.SelectSubset<T, P.${model.name}FindManyArgs>`,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<P.CheckSelect<T, Array<${model.name}>, Array<P.${model.name}GetPayload<T>>>>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<P.CheckSelect<T, Array<${model.name}>, Array<P.${model.name}GetPayload<T>>>>(endpoint, args, options);`,
            ]);

        // get
        useFuncBody
            .addFunction({
                name: 'get',
                typeParameters: [`T extends P.${model.name}FindFirstArgs`],
                returnType: `SWRResponse<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>, any>`,
                parameters: [
                    {
                        name: 'id',
                        type: 'String | undefined',
                    },
                    {
                        name: 'args?',
                        type: `P.SelectSubset<T, P.Subset<P.${model.name}FindFirstArgs, 'select' | 'include'>>`,
                    },
                    {
                        name: 'options?',
                        type: `RequestOptions<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>`,
                    },
                ],
            })
            .addBody()
            .addStatements([
                `return request.get<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>(id ? \`\${endpoint}/\${id}\`: null, args, options);`,
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
                `
                // validate field-level constraints
                validate(${this.getValidator(model, 'update')}, args.data);
                
                try {
                    return await request.put<Omit<P.${
                        model.name
                    }UpdateArgs, 'where'>, P.CheckSelect<T, ${model.name}, P.${
                    model.name
                }GetPayload<T>>>(\`\${endpoint}/\${id}\`, args, mutate);
                } catch (err: any) {
                    if (err.info?.code === ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED) {
                        return undefined;
                    } else {
                        throw err;
                    }
                }
                `,
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
                `
                try {
                    return await request.del<P.CheckSelect<T, ${model.name}, P.${model.name}GetPayload<T>>>(\`\${endpoint}/\${id}\`, args, mutate);
                } catch (err: any) {
                    if (err.info?.code === ServerErrorCode.READ_BACK_AFTER_WRITE_DENIED) {
                        return undefined;
                    } else {
                        throw err;
                    }
                }
                `,
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
            path.join(context.generatedCodeDir, 'src/hooks/index.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addStatements(
            models.map((d) => `export * from './${paramCase(d.name)}';`)
        );

        sf.formatText();
    }
}
