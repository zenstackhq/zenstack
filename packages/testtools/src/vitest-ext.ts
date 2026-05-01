import { ORMError, ORMErrorReason } from '@zenstackhq/orm';
import { expect } from 'vitest';

function isPromise(value: any) {
    return typeof value.then === 'function' && typeof value.catch === 'function';
}

function expectErrorReason(err: any, errorReason: ORMErrorReason) {
    if (err instanceof ORMError && err.reason === errorReason) {
        return {
            message: () => '',
            pass: true,
        };
    } else {
        return {
            message: () => `expected ORMError of reason ${errorReason}, got ${err}`,
            pass: false,
        };
    }
}

function expectErrorMessages(expectedMessages: string[], message: string) {
    for (const m of expectedMessages) {
        if (!message.toLowerCase().includes(m.toLowerCase())) {
            return {
                message: () => `expected message not found in error: ${m}, got message: ${message}`,
                pass: false,
            };
        }
    }
    return undefined;
}

expect.extend({
    async toResolveTruthy(received: Promise<unknown>) {
        if (!isPromise(received)) {
            return { message: () => 'a promise is expected', pass: false };
        }
        const r = await received;
        return {
            pass: !!r,
            message: () => `Expected promise to resolve to a truthy value, but got ${r}`,
        };
    },

    async toResolveFalsy(received: Promise<unknown>) {
        if (!isPromise(received)) {
            return { message: () => 'a promise is expected', pass: false };
        }
        const r = await received;
        return {
            pass: !r,
            message: () => `Expected promise to resolve to a falsy value, but got ${r}`,
        };
    },

    async toResolveNull(received: Promise<unknown>) {
        if (!isPromise(received)) {
            return { message: () => 'a promise is expected', pass: false };
        }
        const r = await received;
        return {
            pass: r === null,
            message: () => `Expected promise to resolve to a null value, but got ${r}`,
        };
    },

    async toResolveWithLength(received: Promise<unknown>, length: number) {
        const r = await received;
        return {
            pass: Array.isArray(r) && r.length === length,
            message: () => `Expected promise to resolve with an array with length ${length}, but got ${r}`,
        };
    },

    async toBeRejectedNotFound(received: Promise<unknown>) {
        if (!isPromise(received)) {
            return { message: () => 'a promise is expected', pass: false };
        }
        try {
            await received;
        } catch (err) {
            return expectErrorReason(err, ORMErrorReason.NOT_FOUND);
        }
        return {
            message: () => `expected NotFoundError, got no error`,
            pass: false,
        };
    },

    async toBeRejectedByPolicy(received: Promise<unknown>, expectedMessages?: string[], expectedCodes?: string[]) {
        if (!isPromise(received)) {
            return { message: () => 'a promise is expected', pass: false };
        }
        try {
            await received;
        } catch (err) {
            if (err instanceof ORMError && err.reason === ORMErrorReason.REJECTED_BY_POLICY) {
                if (expectedMessages) {
                    const r = expectErrorMessages(expectedMessages, err.message || '');
                    if (r) {
                        return r;
                    }
                }
                if (expectedCodes) {
                    const actualCodes = err.policyCodes ?? [];
                    const missing = expectedCodes.filter((c) => !actualCodes.includes(c));
                    const extra = actualCodes.filter((c) => !expectedCodes.includes(c));
                    if (missing.length > 0 || extra.length > 0) {
                        return {
                            message: () =>
                                `expected policy codes [${expectedCodes.join(', ')}], got [${actualCodes.join(', ') || '(none)'}]`,
                            pass: false,
                        };
                    }
                }
            }
            return expectErrorReason(err, ORMErrorReason.REJECTED_BY_POLICY);
        }
        return {
            message: () => `expected PolicyError, got no error`,
            pass: false,
        };
    },

    async toBeRejectedByValidation(received: Promise<unknown>, expectedMessages?: string[]) {
        if (!isPromise(received)) {
            return { message: () => 'a promise is expected', pass: false };
        }
        try {
            await received;
        } catch (err) {
            if (expectedMessages && err instanceof ORMError && err.reason === ORMErrorReason.INVALID_INPUT) {
                const r = expectErrorMessages(expectedMessages, err.message || '');
                if (r) {
                    return r;
                }
            }
            return expectErrorReason(err, ORMErrorReason.INVALID_INPUT);
        }
        return {
            message: () => `expected InputValidationError, got no error`,
            pass: false,
        };
    },
});
