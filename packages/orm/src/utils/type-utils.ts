import type Decimal from 'decimal.js';
import type { JsonObject, JsonValue } from '../common-types';

export type Optional<T extends object, K extends keyof T = keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type PartialIf<T, Condition extends boolean> = Condition extends true ? Partial<T> : T;

export type NullableIf<T, Condition extends boolean> = Condition extends true ? T | null : T;

export type ArrayIf<T, Condition extends boolean> = Condition extends true ? T[] : T;

export type PartialRecord<K extends string | number | symbol, T> = Partial<Record<K, T>>;

type _Preserve = Date | Function | Decimal | Uint8Array | JsonObject | JsonValue;
type _Depth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
export type Simplify<T, D extends number = 6> = D extends 0
    ? T
    : T extends object
      ? T extends _Preserve
          ? T
          : { [K in keyof T]: Simplify<T[K], _Depth[D]> } & {}
      : T;

export type SimplifyIf<T, Condition extends boolean> = Condition extends true ? Simplify<T> : T;

export type WrapType<T, Optional = false, Array = false> = Array extends true
    ? Optional extends true
        ? T[] | null
        : T[]
    : Optional extends true
      ? T | null
      : T;

export type TypeMap = {
    String: string;
    Boolean: boolean;
    Int: number;
    Float: number;
    BigInt: bigint;
    Decimal: Decimal;
    DateTime: Date;
    Bytes: Uint8Array;
    Json: JsonValue | null;
    Null: null;
    Object: Record<string, unknown>;
    Any: unknown;
    Unsupported: unknown;
    Void: void;
    Undefined: undefined;
};

export type MapBaseType<T extends string> = T extends keyof TypeMap ? TypeMap[T] : unknown;

export function call(code: string) {
    return { code };
}

export type OrArray<T, IF extends boolean = true> = IF extends true ? T | T[] : T;

export type NonEmptyArray<T> = [T, ...T[]];

export type ValueOfPotentialTuple<T> = T extends unknown[] ? T[number] : T;

// cause typescript not to expand types and preserve names
type NoExpand<T> = T extends unknown ? T : never;

// this type assumes the passed object is entirely optional
export type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
        ? (K extends keyof O ? { [P in K]: O[P] } & O : O) | ({ [P in keyof O as P extends K ? K : never]-?: O[P] } & O)
        : never
>;

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

export type XOR<T, U> = T extends object ? (U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : U) : T;

export type MergeIf<T, U, Condition extends boolean> = Condition extends true ? T & U : T;

export type MaybePromise<T> = T | Promise<T>;

export type PrependParameter<Param, Func> = Func extends (...args: any[]) => infer R
    ? (p: Param, ...args: Parameters<Func>) => R
    : never;

export type OrUndefinedIf<T, Condition extends boolean> = Condition extends true ? T | undefined : T;

export type UnwrapTuplePromises<T extends readonly unknown[]> = {
    [K in keyof T]: Awaited<T[K]>;
};

export type Exact<T, Shape> = T extends Shape ? (Exclude<keyof T, keyof Shape> extends never ? T : never) : never;
