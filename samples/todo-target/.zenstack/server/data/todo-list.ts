import type { NextApiRequest, NextApiResponse } from 'next';
import {
    TodoListCreateArgs,
    TodoListFindArgsInput,
    TodoListUpdateArgs,
} from '../../types';
import client from '../../client';
import { requireUser, unauthorized } from './utils';
import { RequestionHandlerOptions } from '..';

async function handleGet(
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    const user = await requireUser(req, res, options);
    if (!user) {
        return;
    }

    const condition = req.query.q
        ? (JSON.parse(req.query.q as string) as TodoListFindArgsInput)
        : null;

    const args: TodoListFindArgsInput = {
        ...condition,
        where: {
            AND: [
                condition?.where ? condition.where : {},
                {
                    OR: [
                        {
                            ownerId: user.id,
                        },
                        {
                            space: {
                                members: {
                                    some: {
                                        userId: user.id,
                                    },
                                },
                            },
                        },
                    ],
                },
            ],
        },
    };

    const r = await client.prisma.todoList.findMany(args);
    res.status(200).send(r);
}

async function handlePost(
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    const user = await requireUser(req, res, options);
    if (!user) {
        return;
    }

    const body = req.body as TodoListCreateArgs;
    if (body.data.ownerId && body.data.ownerId !== user.id) {
        return unauthorized(res);
    }

    const r = await client.prisma.todoList.create(body);

    res.status(200).send(r);
}

async function handlePut(
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    const user = await requireUser(req, res, options);
    if (!user) {
        return;
    }

    const body = req.body as TodoListUpdateArgs;
    if (body.data.ownerId && body.data.ownerId !== user.id) {
        return unauthorized(res);
    }

    const r = await client.prisma.todoList.update({
        ...body,
        where: { id: path[0] },
    });

    res.status(200).send(r);
}

async function handleDelete(
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    const user = await requireUser(req, res, options);
    if (!user) {
        return;
    }

    const r = await client.prisma.todoList.delete({
        where: { id: path[0] },
    });

    res.status(200).send(r);
}

export default async function (
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    switch (req.method) {
        case 'GET':
            return handleGet(req, res, path, options);

        case 'POST':
            return handlePost(req, res, path, options);

        case 'PUT':
            return handlePut(req, res, path, options);

        case 'DELETE':
            return handleDelete(req, res, path, options);
    }
}
