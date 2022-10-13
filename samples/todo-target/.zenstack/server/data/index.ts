import type { NextApiRequest, NextApiResponse } from 'next';
import todoListHandler from './todo-list';
import { RequestionHandlerOptions } from '../index';

export default async function (
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    const [type, ...rest] = path;
    switch (type) {
        case 'todoList':
            return todoListHandler(req, res, rest, options);

        default:
            res.status(404).json({ error: 'Unknown type: ' + type });
    }
}
