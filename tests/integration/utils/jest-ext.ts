import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { format } from 'util';

export const toBeRejectedByPolicy = async function (received: Promise<unknown>, expectedMessages?: string[]) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        await received;
    } catch (err: any) {
        if (expectedMessages) {
            const message = err.message || '';
            for (const m of expectedMessages) {
                if (!message.includes(m)) {
                    return {
                        message: () => `expected message not found in error: ${m}, got message: ${message}`,
                        pass: false,
                    };
                }
            }
        }
        return expectPrismaCode(err, 'P2004');
    }
    return {
        message: () => `expected PrismaClientKnownRequestError, got no error`,
        pass: false,
    };
};

export const toBeNotFound = async function (received: Promise<unknown>) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        await received;
    } catch (err) {
        return expectPrismaCode(err, 'P2025');
    }
    return {
        message: () => `expected PrismaClientKnownRequestError, got no error`,
        pass: false,
    };
};

export const toBeRejectedWithCode = async function (received: Promise<unknown>, code: string) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        await received;
    } catch (err) {
        return expectPrismaCode(err, code);
    }
    return {
        message: () => `expected PrismaClientKnownRequestError, got no error`,
        pass: false,
    };
};

export const toResolveTruthy = async function (received: Promise<unknown>) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        const r = await received;
        if (r) {
            return {
                message: () => '',
                pass: true,
            };
        } else {
            return {
                message: () => 'resolved to a falsy value',
                pass: false,
            };
        }
    } catch (err) {
        return {
            message: () => `promise rejected: ${err}`,
            pass: false,
        };
    }
};

export const toResolveFalsy = async function (received: Promise<unknown>) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        const r = await received;
        if (!r) {
            return {
                message: () => '',
                pass: true,
            };
        } else {
            return {
                message: () => `resolved to a truthy value: ${r}`,
                pass: false,
            };
        }
    } catch (err) {
        return {
            message: () => `promise rejected: ${err}`,
            pass: false,
        };
    }
};

export const toResolveNull = async function (received: Promise<unknown>) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        const r = await received;
        if (r === null) {
            return {
                message: () => '',
                pass: true,
            };
        } else {
            return {
                message: () => `resolved to a non-null value: ${format(r)}`,
                pass: false,
            };
        }
    } catch (err) {
        return {
            message: () => `promise rejected: ${err}`,
            pass: false,
        };
    }
};

function expectPrismaCode(err: any, code: string) {
    const errCode = (err as PrismaClientKnownRequestError).code;
    if (errCode !== code) {
        return {
            message: () => `expected PrismaClientKnownRequestError.code 'P2004', got ${errCode ?? err}`,
            pass: false,
        };
    }
    return {
        message: () => '',
        pass: true,
    };
}
