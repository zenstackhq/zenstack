import { NextApiRequest, NextApiResponse } from 'next';
import { ServerErrorCode } from '../types';

/**
 * Defines contract for a Next.js API endpoint handler.
 */
export interface RequestHandler {
    /**
     * Handles a request for a given route path.
     *
     * @param req The request
     * @param res The response
     * @param path The route path (with /api/zenstack prefix removed)
     */
    handle(
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[]
    ): Promise<void>;
}

/**
 * Error thrown during request handling
 */
export class RequestHandlerError extends Error {
    constructor(public readonly code: ServerErrorCode, message: string) {
        super(message);
    }

    toString(): string {
        return `Request handler error: ${this.code}, ${this.message}`;
    }
}

/**
 * All write actions supported by Prisma
 */
export const PrismaWriteActions = [
    'create',
    'createMany',
    'connectOrCreate',
    'update',
    'updateMany',
    'upsert',
    'delete',
    'deleteMany',
    'connect',
] as const;

export type PrismaWriteActionType = typeof PrismaWriteActions[number];
