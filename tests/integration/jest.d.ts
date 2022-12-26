interface CustomMatchers<R = unknown> {
    toBeRejectedByPolicy(): Promise<R>;
    toBeNotFound(): Promise<R>;
    toResolveTruthy(): Promise<R>;
    toResolveFalsy(): Promise<R>;
    toResolveNull(): Promise<R>;
}
declare global {
    namespace jest {
        interface Expect extends CustomMatchers {}
        interface Matchers<R> extends CustomMatchers<R> {}
        interface InverseAsymmetricMatchers extends CustomMatchers {}
    }
}
export {};
