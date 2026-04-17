export type JsonValue = string | number | boolean | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue | null };
export type JsonArray = Array<JsonValue | null>;
export type JsonNullValues = DbNull | JsonNull | AnyNull;

export class DbNullClass {
    // @ts-ignore
    private __brand = 'DbNull' as const;
}
export const DbNull = new DbNullClass();
export type DbNull = typeof DbNull;

export class JsonNullClass {
    // @ts-ignore
    private __brand = 'JsonNull' as const;
}
export const JsonNull = new JsonNullClass();
export type JsonNull = typeof JsonNull;

export class AnyNullClass {
    // @ts-ignore
    private __brand = 'AnyNull' as const;
}
export const AnyNull = new AnyNullClass();
export type AnyNull = typeof AnyNull;
