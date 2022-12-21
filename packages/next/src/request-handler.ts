import { NextApiRequest, NextApiResponse } from 'next';
import { DbOperationName, PrismaContract } from './types';
import superjson from 'superjson';

/**
 * Options for initializing a Next.js API endpoint request handler.
 * @see requestHandler
 */
export type RequestHandlerOptions = {
    /**
     * Callback method for getting a Prisma instance for the given request/response pair.
     */
    getPrisma: (
        req: NextApiRequest,
        res: NextApiResponse
    ) => Promise<unknown> | unknown;
};

/**
 * Creates a Next.js API endpoint request handler which encapsulates Prisma CRUD operations.
 *
 * @param options Options for initialization
 * @returns An API endpoint request handler
 */
export function requestHandler(
    options: RequestHandlerOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        let prisma = options.getPrisma(req, res);
        if (prisma instanceof Promise) {
            prisma = await prisma;
        }
        if (!prisma) {
            res.status(500).send({
                error: 'unable to get prisma from request context',
            });
            return;
        }
        return handleRequest(req, res, prisma as PrismaContract);
    };
}

async function handleRequest(
    req: NextApiRequest,
    res: NextApiResponse,
    prisma: PrismaContract
): Promise<void> {
    const [model, op] = req.query.path as string[];

    const dbOp = op as DbOperationName;
    let args: unknown;
    let resCode = 200;

    switch (dbOp) {
        case 'create':
        case 'createMany':
        case 'upsert':
            if (req.method !== 'POST') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = req.body;
            resCode = 201;
            break;

        case 'findFirst':
        case 'findUnique':
        case 'findMany':
        case 'aggregate':
        case 'groupBy':
        case 'count':
            if (req.method !== 'GET') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = req.query.q ? unmarshal(req.query.q as string) : {};
            break;

        case 'update':
        case 'updateMany':
            if (req.method !== 'PUT') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = req.body;
            break;

        case 'delete':
        case 'deleteMany':
            if (req.method !== 'DELETE') {
                res.status(400).send({ error: 'invalid http method' });
                return;
            }
            args = req.query.q ? unmarshal(req.query.q as string) : {};
            break;

        default:
            res.status(400).send({ error: `unknown method name: ${op}` });
            break;
    }

    const result = await prisma[model][dbOp](args);

    // TODO: how to filter out zenstack_* fields
    res.status(resCode).send(marshal(result));
}

function marshal(value: unknown) {
    return JSON.parse(superjson.stringify(value));
}

function unmarshal(value: unknown) {
    if (typeof value === 'string') {
        return superjson.parse(value);
    } else {
        return superjson.parse(JSON.stringify(value));
    }
}
