/* eslint-disable @typescript-eslint/no-explicit-any */
import { z as Z } from 'zod';

/**
 * A smarter version of `z.union` that decide which candidate to use based on how few unrecognized keys it has.
 *
 * The helper is used to deal with ambiguity in union generated for Prisma inputs when the zod schemas are configured
 * to run in "strip" object parsing mode. Since "strip" automatically drops unrecognized keys, it may result in
 * accidentally matching a less-ideal schema candidate.
 *
 * The helper uses a custom schema to find the candidate that results in the fewest unrecognized keys when parsing the data.
 *
 * The function uses `any` for parameter and return type to be compatible with various zod versions.
 */
export function smartUnion(z: any, candidates: any[]): any {
    // strip `z.lazy`
    const processedCandidates: Z.ZodSchema[] = candidates.map((candidate) => unwrapLazy(z, candidate));

    if (processedCandidates.some((c) => !(c instanceof z.ZodObject || c instanceof z.ZodArray))) {
        // fall back to plain union if not all candidates are objects or arrays
        return z.union(candidates as any);
    }

    let resultData: any;

    return z
        .custom((data: any) => {
            if (Array.isArray(data)) {
                const { data: result, success } = smartArrayUnion(
                    z,
                    processedCandidates.filter((c) => c instanceof z.ZodArray) as Array<
                        Z.ZodArray<Z.ZodObject<Z.ZodRawShape>>
                    >,
                    data
                );
                if (success) {
                    resultData = result;
                }
                return success;
            } else {
                const { data: result, success } = smartObjectUnion(
                    z,
                    processedCandidates.filter((c) => c instanceof z.ZodObject) as Z.ZodObject<Z.ZodRawShape>[],
                    data
                );
                if (success) {
                    resultData = result;
                }
                return success;
            }
        })
        .transform(() => {
            // return the parsed data
            return resultData;
        });
}

function smartArrayUnion(z: typeof Z, candidates: Array<Z.ZodArray<Z.ZodObject<Z.ZodRawShape>>>, data: any) {
    if (candidates.length === 0) {
        return { data: undefined, success: false };
    }

    if (!Array.isArray(data)) {
        return { data: undefined, success: false };
    }

    if (data.length === 0) {
        return { data, success: true };
    }

    // use the first element to identify the candidate schema to use
    const item = data[0];
    const itemSchema = identifyCandidate(
        z,
        candidates.map((candidate) => candidate.element),
        item
    );

    // find the matching schema and re-parse the data
    const schema = candidates.find((candidate) => candidate.element === itemSchema);
    return schema!.safeParse(data);
}

function smartObjectUnion(z: typeof Z, candidates: Z.ZodObject<Z.ZodRawShape>[], data: any) {
    if (candidates.length === 0) {
        return { data: undefined, success: false };
    }
    const schema = identifyCandidate(z, candidates, data);
    return schema.safeParse(data);
}

function identifyCandidate(
    z: typeof Z,
    candidates: Array<Z.ZodObject<Z.ZodRawShape> | Z.ZodLazy<Z.ZodObject<Z.ZodRawShape>>>,
    data: any
) {
    const strictResults = candidates.map((candidate) => {
        // make sure to strip `z.lazy` before parsing
        const unwrapped = unwrapLazy(z, candidate);
        return {
            schema: candidate,
            // force object schema to run in strict mode to capture unrecognized keys
            result: unwrapped.strict().safeParse(data),
        };
    });

    // find the schema with the fewest unrecognized keys
    const { schema } = strictResults.sort((a, b) => {
        const aCount = countUnrecognizedKeys(a.result.error?.issues ?? []);
        const bCount = countUnrecognizedKeys(b.result.error?.issues ?? []);
        return aCount - bCount;
    })[0];
    return schema;
}

function countUnrecognizedKeys(issues: Z.ZodIssue[]) {
    return issues
        .filter((issue) => issue.code === 'unrecognized_keys')
        .map((issue) => issue.keys.length)
        .reduce((a, b) => a + b, 0);
}

function unwrapLazy<T extends Z.ZodSchema>(z: typeof Z, schema: T | Z.ZodLazy<T>): T {
    if (!(schema instanceof z.ZodLazy)) {
        return schema;
    }
    if ('unwrap' in schema && typeof schema.unwrap === 'function') {
        return schema.unwrap();
    } else if ('schema' in schema) {
        return schema.schema as T;
    } else {
        throw new Error('Unable to determine how to unwrap a lazy schema with this zod version.');
    }
}
