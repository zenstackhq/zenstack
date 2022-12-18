import { DataModel, isDataModel, Model } from '@zenstackhq/language/ast';
import { PluginOptions } from '@zenstackhq/sdk';
import { paramCase } from 'change-case';
import * as path from 'path';
import { Project } from 'ts-morph';
import { RUNTIME_PACKAGE } from '../constants';

/**
 * Generate react data query hooks code
 */
export default class ReactHooksGenerator {
    async generate(model: Model, options: PluginOptions) {
        const project = new Project();
        const models: DataModel[] = [];
        const warnings: string[] = [];

        for (const dm of model.declarations.filter((d): d is DataModel =>
            isDataModel(d)
        )) {
            const hasAllowRule = dm.attributes.find(
                (attr) => attr.decl.ref?.name === '@@allow'
            );
            if (!hasAllowRule) {
                warnings.push(
                    `Not generating hooks for "${dm.name}" because it doesn't have any @@allow rule`
                );
            } else {
                models.push(dm);
            }
        }

        const outDir =
            (options.output as string) ?? 'node_modules/.zenstack/src/hooks';

        this.generateIndex(project, outDir, models);

        models.forEach((d) => this.generateModelHooks(project, outDir, d));

        await project.save();
        return warnings;
    }

    private getValidator(model: DataModel, mode: 'create' | 'update') {
        return `${model.name}_${mode}_validator`;
    }

    private generateModelHooks(
        project: Project,
        outDir: string,
        model: DataModel
    ) {
        const fileName = paramCase(model.name);
        const sf = project.createSourceFile(
            path.join(outDir, `${fileName}.ts`),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: [{ name: 'Prisma', alias: 'P' }, model.name],
            isTypeOnly: true,
            moduleSpecifier: '@prisma/client',
        });
        sf.addStatements([
            `import * as request from '${RUNTIME_PACKAGE}/lib/request';`,
            `import { ServerErrorCode, RequestOptions } from '${RUNTIME_PACKAGE}/lib/types';`,
            `import { type SWRResponse } from 'swr';`,
            // `import { validate } from '${RUNTIME_PACKAGE}/lib/validation';`,
            // `import { ${this.getValidator(
            //     model,
            //     'create'
            // )}, ${this.getValidator(
            //     model,
            //     'update'
            // )} } from '../field-constraint';`,
        ]);

        const useFunc = sf.addFunction({
            name: `use${model.name}`,
            isExported: true,
        });

        useFunc.addParameter({
            name: 'endpoint',
            type: 'string',
            initializer: `'/api/zenstack/data'`,
        });

        useFunc.addStatements(['const mutate = request.getMutate();']);

        // create
        useFunc
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
                // // validate field-level constraints
                // validate(${this.getValidator(model, 'create')}, args.data);

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
        useFunc
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
        useFunc
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
        useFunc
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
                // // validate field-level constraints
                // validate(${this.getValidator(model, 'update')}, args.data);
                
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
        useFunc
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

        useFunc.addStatements(['return { create, find, get, update, del };']);

        sf.formatText();
    }

    private generateIndex(
        project: Project,
        outDir: string,
        models: DataModel[]
    ) {
        const sf = project.createSourceFile(
            path.join(outDir, 'index.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addStatements(
            models.map((d) => `export * from './${paramCase(d.name)}';`)
        );

        sf.formatText();
    }
}
