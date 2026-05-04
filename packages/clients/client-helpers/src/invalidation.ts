import type { SchemaDef } from '@zenstackhq/schema';
import { log, type Logger } from './logging';
import { getMutatedModels, getReadModels } from './query-analysis';
import type { MaybePromise, ORMWriteActionType } from './types';

/**
 * Type for a predicate that determines whether a query should be invalidated.
 */
export type InvalidationPredicate = ({ model, args }: { model: string; args: unknown }) => boolean;

/**
 * Type for a function that invalidates queries matching the given predicate.
 */
export type InvalidateFunc = (predicate: InvalidationPredicate) => MaybePromise<void>;

/**
 * Create a function that invalidates queries affected by the given mutation operation.
 *
 * @param model Model under mutation.
 * @param operation Mutation operation (e.g, `update`).
 * @param schema The schema.
 * @param invalidator Function to invalidate queries matching a predicate. It should internally
 * enumerate all query cache entries and invalidate those for which the predicate returns true.
 * @param logging Logging option.
 */
export function createInvalidator(
    model: string,
    operation: string,
    schema: SchemaDef,
    invalidator: InvalidateFunc,
    logging: Logger | undefined,
) {
    const normalizedModel = normalizeModelName(model, schema);
    return async (...args: unknown[]) => {
        const [_, variables] = args;
        const predicate = await getInvalidationPredicate(
            normalizedModel,
            operation as ORMWriteActionType,
            variables,
            schema,
            logging,
        );
        await invalidator(predicate);
    };
}

// gets a predicate for evaluating whether a query should be invalidated
async function getInvalidationPredicate(
    model: string,
    operation: ORMWriteActionType,
    mutationArgs: any,
    schema: SchemaDef,
    logging: Logger | undefined,
): Promise<InvalidationPredicate> {
    const mutatedModels = await getMutatedModels(model, operation, mutationArgs, schema);

    return ({ model, args }) => {
        if (mutatedModels.includes(model)) {
            // direct match
            if (logging) {
                log(
                    logging,
                    `Marking "${model}" query for invalidation due to mutation "${operation}", query args: ${JSON.stringify(args)}`,
                );
            }
            return true;
        }

        if (args) {
            // traverse query args to find nested reads that match the model under mutation
            if (findNestedRead(model, mutatedModels, schema, args)) {
                if (logging) {
                    log(
                        logging,
                        `Marking "${model}" query for invalidation due to mutation "${operation}", query args: ${JSON.stringify(args)}`,
                    );
                }
                return true;
            }
        }

        return false;
    };
}

// find nested reads that match the given models
function findNestedRead(visitingModel: string, targetModels: string[], schema: SchemaDef, args: any) {
    const modelsRead = getReadModels(visitingModel, schema, args);
    return targetModels.some((m) => modelsRead.includes(m));
}

// resolves a model name to its canonical form as defined in the schema (case-insensitive match)
function normalizeModelName(model: string, schema: SchemaDef) {
    const target = model.toLowerCase();
    return Object.keys(schema.models).find((k) => k.toLowerCase() === target) ?? model;
}
