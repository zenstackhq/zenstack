/* eslint-disable */
import { TRPCError } from '@trpc/server';
import { isPrismaClientKnownRequestError } from '@zenstackhq/runtime';

export async function checkMutate<T>(promise: Promise<T>): Promise<T | undefined> {
    try {
        return await promise;
    } catch (err: any) {
        if (isPrismaClientKnownRequestError(err)) {
            if (err.code === 'P2004') {
                if (err.meta?.reason === 'RESULT_NOT_READABLE') {
                    // unable to readback data
                    return undefined;
                } else {
                    // rejected by policy
                    throw new TRPCError({
                        code: 'FORBIDDEN',
                        message: err.message,
                        cause: err,
                    });
                }
            } else {
                // request error
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: err.message,
                    cause: err,
                });
            }
        } else {
            throw err;
        }
    }

}

export async function checkRead<T>(promise: Promise<T>): Promise<T> {
    try {
        return await promise;
    } catch (err: any) {
        if (isPrismaClientKnownRequestError(err)) {
            if (err.code === 'P2004') {
                // rejected by policy
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: err.message,
                    cause: err,
                });
            } else if (err.code === 'P2025') {
                // not found
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: err.message,
                    cause: err,
                });
            } else {
                // request error
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: err.message,
                    cause: err,
                })
            }
        } else {
            throw err;
        }
    }

}
