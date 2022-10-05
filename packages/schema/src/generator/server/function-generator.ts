import { Context } from '../types';
import { Project } from 'ts-morph';
import * as path from 'path';

export default function generate(project: Project, context: Context) {
    generateIndex(project, context);
}

function generateIndex(project: Project, context: Context) {
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
        path.join(context.outDir, 'server/function/index.ts'),
        content,
        { overwrite: true }
    );
    sf.formatText();
}
