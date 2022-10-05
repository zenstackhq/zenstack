import { Context } from '../types';
import { Project } from 'ts-morph';
import { DataModel, isDataModel } from '../../language-server/generated/ast';
import * as path from 'path';
import { camelCase, paramCase } from 'change-case';

export default function generate(project: Project, context: Context) {
    const models = context.schema.declarations.filter(
        (d) => isDataModel(d) && hasAllowRules(d)
    ) as DataModel[];

    generateIndex(models, project, context);
    models.forEach((model) => generateForModel(model, project, context));
}

function hasAllowRules(model: DataModel) {
    return !!model.attributes.find((attr) => attr.decl.ref?.name === 'allow');
}

function generateIndex(
    models: DataModel[],
    project: Project,
    context: Context
) {
    const content = `
    import type { NextApiRequest, NextApiResponse } from 'next';
    import { RequestionHandlerOptions } from '..';
    ${models.map((model) => modelImport(model)).join('\n')}    
    
    export default async function (
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[],
        options: RequestionHandlerOptions
    ) {
        const [type, ...rest] = path;
        switch (type) {
            ${models.map((model) => modelEntrance(model)).join('\n')}
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

function modelImport(model: DataModel) {
    return `import ${camelCase(model.name)}Handler from './${paramCase(
        model.name
    )}';`;
}

function modelEntrance(model: DataModel) {
    return `
        case '${camelCase(model.name)}':
            return ${camelCase(model.name)}Handler(req, res, rest, options);
    `;
}

function generateForModel(
    model: DataModel,
    project: Project,
    context: Context
) {
    const content = `
    import type { NextApiRequest, NextApiResponse } from 'next';
    import { RequestionHandlerOptions } from '..';

    export default async function (
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[],
        options: RequestionHandlerOptions
    ) {
        throw new Error('Not implemented');
    }
    `;
    const sf = project.createSourceFile(
        path.join(context.outDir, `server/data/${paramCase(model.name)}.ts`),
        content,
        { overwrite: true }
    );
    sf.formatText();
}
