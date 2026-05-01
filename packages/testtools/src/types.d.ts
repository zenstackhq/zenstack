import 'vitest';

interface CustomMatchers<R = unknown> {
    toResolveTruthy: () => Promise<R>;
    toResolveFalsy: () => Promise<R>;
    toResolveNull: () => Promise<R>;
    toResolveWithLength: (length: number) => Promise<R>;
    toBeRejectedNotFound: () => Promise<R>;
    toBeRejectedByPolicy: (expectedMessages?: string[], expectedCode?: string) => Promise<R>;
    toBeRejectedByValidation: (expectedMessages?: string[]) => Promise<R>;
}

declare module 'vitest' {
    interface Assertion<T = any> extends CustomMatchers<T> {}
    interface AsymmetricMatchersContaining extends CustomMatchers {}
}
