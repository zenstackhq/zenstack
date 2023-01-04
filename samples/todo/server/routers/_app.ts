import { createRouter as createCRUDRouter } from './generated/routers';
import { initTRPC } from '@trpc/server';
import { type Context } from '../context';
import superjson from 'superjson';
import {
    PrismaClientKnownRequestError,
    PrismaClientUnknownRequestError,
    PrismaClientValidationError,
} from '@prisma/client/runtime';

function makePrismaError(error: Error | undefined) {
    if (error instanceof PrismaClientKnownRequestError) {
        return {
            clientVersion: error.clientVersion,
            code: error.code,
            message: error.message,
        };
    } else if (error instanceof PrismaClientUnknownRequestError) {
        return {
            clientVersion: error.clientVersion,
            message: error.message,
        };
    } else if (error instanceof PrismaClientValidationError) {
        return {
            message: error.message,
        };
    }
    return undefined;
}

const t = initTRPC.context<Context>().create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                prismaError: makePrismaError(error.cause),
            },
        };
    },
});

export const appRouter = createCRUDRouter(t.router, t.procedure);

export type AppRouter = typeof appRouter;
