import { NextApiRequest, NextApiResponse } from 'next';
import { ServerErrorCode } from '../types';

export interface RequestHandler {
    handle(
        req: NextApiRequest,
        res: NextApiResponse,
        path: string[]
    ): Promise<void>;
}

export class RequestHandlerError extends Error {
    constructor(public readonly code: ServerErrorCode, message: string) {
        super(message);
    }

    toString() {
        return `Request handler error: ${this.code}, ${this.message}`;
    }
}
