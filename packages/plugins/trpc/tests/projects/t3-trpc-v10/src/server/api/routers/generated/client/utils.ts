/* eslint-disable */

// inspired by: https://stackoverflow.com/questions/70632026/generic-to-recursively-modify-a-given-type-interface-in-typescript

type Primitive = string | Function | number | boolean | Symbol | undefined | null;

/**
 * Recursively merges `T` and `R`. If there's a shared key, use `R`'s field type to overwrite `T`.
 */
export type DeepOverride<T, R> = T extends Primitive
    ? R
    : R extends Primitive
    ? R
    : {
        [K in keyof T]: K extends keyof R ? DeepOverride<T[K], R[K]> : T[K];
    } & {
        [K in Exclude<keyof R, keyof T>]: R[K];
    };

/**
 * Traverse to `Path` (denoted by dot separated string literal type) in `T`, and starting from there,
 * recursively merge with `R`.
 */
export type DeepOverrideAtPath<T, R, Path extends string | undefined = undefined> = Path extends undefined
    ? DeepOverride<T, R>
    : Path extends `${infer P1}.${infer P2}`
    ? P1 extends keyof T
    ? Omit<T, P1> & Record<P1, DeepOverride<T[P1], DeepOverrideAtPath<T[P1], R, P2>>>
    : never
    : Path extends keyof T
    ? Omit<T, Path> & Record<Path, DeepOverride<T[Path], R>>
    : never;
