import { PrismaClientKnownRequestError } from '@prisma/client/runtime';

export const toBeRejectedByPolicy = async function (received: Promise<unknown>) {
    if (!(received instanceof Promise)) {
        return { message: () => 'a promise is expected', pass: false };
    }
    try {
        await received;
    } catch (err) {
        const code = (err as PrismaClientKnownRequestError).code;
        if (code !== 'P2004') {
            return {
                message: () => `expected PrismaClientKnownRequestError.code 'P2004', got ${code}`,
                pass: false,
            };
        }
        return {
            message: () => '',
            pass: true,
        };
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
        const code = (err as PrismaClientKnownRequestError).code;
        if (code !== 'P2025') {
            return {
                message: () => `expected PrismaClientKnownRequestError.code 'P2025', got ${code}`,
                pass: false,
            };
        }
        return {
            message: () => '',
            pass: true,
        };
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
                message: () => `resolved to a non-null value: ${r}`,
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
