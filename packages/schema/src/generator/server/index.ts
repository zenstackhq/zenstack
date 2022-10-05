import { Project } from 'ts-morph';
import { Context, Generator } from '../types';
import * as path from 'path';
import generateData from './data-generator';
import generateFunction from './function-generator';

export default class DataServerGenerator implements Generator {
    async generate(context: Context) {
        const project = new Project();

        this.generateIndex(project, context);
        generateData(project, context);
        generateFunction(project, context);

        await project.save();
    }

    generateIndex(project: Project, context: Context) {
        const content = `
        import type { NextApiRequest, NextApiResponse } from 'next';
        import dataHandler from './data';
        import functionHandler from './function';
        
        export type RequestionHandlerOptions = {
            getServerUser: (
                req: NextApiRequest,
                res: NextApiResponse
            ) => Promise<{ id: string } | undefined>;
        };
        
        export function RequestHandler(options: RequestionHandlerOptions) {
            return async (req: NextApiRequest, res: NextApiResponse) => {
                const [route, ...rest] = req.query.path as string[];
                switch (route) {
                    case 'data':
                        return dataHandler(req, res, rest, options);
        
                    case 'function':
                        return functionHandler(req, res, rest, options);
        
                    default:
                        res.status(404).json({ error: 'Unknown route: ' + route });
                }
            };
        }
        `;
        const sf = project.createSourceFile(
            path.join(context.outDir, 'server/index.ts'),
            content,
            { overwrite: true }
        );
        sf.formatText();
    }
}
