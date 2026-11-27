import { clone, enumerate, invariant, zip } from '@zenstackhq/common-helpers';
import type { FieldDef, SchemaDef } from '@zenstackhq/schema';
import { log, type Logger } from './logging';
import { NestedWriteVisitor } from './nested-write-visitor';
import type { ORMWriteActionType } from './types';

/**
 * Tries to apply a mutation to a query result.
 *
 * @param queryModel the model of the query
 * @param queryOp the operation of the query
 * @param queryData the result data of the query
 * @param mutationModel the model of the mutation
 * @param mutationOp the operation of the mutation
 * @param mutationArgs the arguments of the mutation
 * @param schema the schema
 * @param logging logging configuration
 * @returns the updated query data if the mutation is applicable, otherwise undefined
 */
export async function applyMutation(
    queryModel: string,
    queryOp: string,
    queryData: any,
    mutationModel: string,
    mutationOp: ORMWriteActionType,
    mutationArgs: any,
    schema: SchemaDef,
    logging: Logger | undefined,
) {
    if (!queryData || (typeof queryData !== 'object' && !Array.isArray(queryData))) {
        return undefined;
    }

    if (!queryOp.startsWith('find')) {
        // only findXXX results are applicable
        return undefined;
    }

    return await doApplyMutation(queryModel, queryData, mutationModel, mutationOp, mutationArgs, schema, logging);
}

async function doApplyMutation(
    queryModel: string,
    queryData: any,
    mutationModel: string,
    mutationOp: ORMWriteActionType,
    mutationArgs: any,
    schema: SchemaDef,
    logging: Logger | undefined,
) {
    let resultData = queryData;
    let updated = false;

    const visitor = new NestedWriteVisitor(schema, {
        create: (model, args) => {
            if (
                model === queryModel &&
                Array.isArray(resultData) // "create" mutation is only relevant for arrays
            ) {
                const r = createMutate(queryModel, resultData, args, schema, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },

        createMany: (model, args) => {
            if (
                model === queryModel &&
                args?.data &&
                Array.isArray(resultData) // "createMany" mutation is only relevant for arrays
            ) {
                for (const oneArg of enumerate(args.data)) {
                    const r = createMutate(queryModel, resultData, oneArg, schema, logging);
                    if (r) {
                        resultData = r;
                        updated = true;
                    }
                }
            }
        },

        update: (model, args) => {
            if (
                model === queryModel &&
                !Array.isArray(resultData) // array elements will be handled with recursion
            ) {
                const r = updateMutate(queryModel, resultData, model, args, schema, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },

        upsert: (model, args) => {
            if (model === queryModel && args?.where && args?.create && args?.update) {
                const r = upsertMutate(queryModel, resultData, model, args, schema, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },

        delete: (model, args) => {
            if (model === queryModel) {
                const r = deleteMutate(queryModel, resultData, model, args, schema, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },
    });

    await visitor.visit(mutationModel, mutationOp, mutationArgs);

    const modelFields = schema.models[queryModel]?.fields;
    invariant(modelFields, `Model ${queryModel} not found in schema`);

    if (Array.isArray(resultData)) {
        // try to apply mutation to each item in the array, replicate the entire
        // array if any item is updated

        let arrayCloned = false;
        for (let i = 0; i < resultData.length; i++) {
            const item = resultData[i];
            if (
                !item ||
                typeof item !== 'object' ||
                item.$optimistic // skip items already optimistically updated
            ) {
                continue;
            }

            const r = await doApplyMutation(queryModel, item, mutationModel, mutationOp, mutationArgs, schema, logging);

            if (r && typeof r === 'object') {
                if (!arrayCloned) {
                    resultData = [...resultData];
                    arrayCloned = true;
                }
                resultData[i] = r;
                updated = true;
            }
        }
    } else if (resultData !== null && typeof resultData === 'object') {
        // Clone resultData to prevent mutations affecting the loop
        const currentData = { ...resultData };

        // iterate over each field and apply mutation to nested data models
        for (const [key, value] of Object.entries(currentData)) {
            const fieldDef = modelFields[key];
            if (!fieldDef?.relation) {
                continue;
            }

            const r = await doApplyMutation(
                fieldDef.type,
                value,
                mutationModel,
                mutationOp,
                mutationArgs,
                schema,
                logging,
            );

            if (r && typeof r === 'object') {
                resultData = { ...resultData, [key]: r };
                updated = true;
            }
        }
    }

    return updated ? resultData : undefined;
}

function createMutate(
    queryModel: string,
    currentData: any,
    newData: any,
    schema: SchemaDef,
    logging: Logger | undefined,
) {
    if (!newData) {
        return undefined;
    }

    const modelFields = schema.models[queryModel]?.fields;
    if (!modelFields) {
        return undefined;
    }

    const insert: any = {};
    const newDataFields = Object.keys(newData);

    Object.entries(modelFields).forEach(([name, field]) => {
        if (field.relation && newData[name]) {
            // deal with "connect"
            assignForeignKeyFields(field, insert, newData[name]);
            return;
        }

        if (newDataFields.includes(name)) {
            insert[name] = clone(newData[name]);
        } else {
            const defaultAttr = field.attributes?.find((attr) => attr.name === '@default');
            if (field.type === 'DateTime') {
                // default value for DateTime field
                if (defaultAttr || field.attributes?.some((attr) => attr.name === '@updatedAt')) {
                    insert[name] = new Date();
                    return;
                }
            }

            const defaultArg = defaultAttr?.args?.[0]?.value;
            if (defaultArg?.kind === 'literal' || defaultArg?.kind === 'enum') {
                // other default value (enum defaults carry member names)
                insert[name] = defaultArg.value;
            }
        }
    });

    // add temp id value
    const idFields = getIdFields(schema, queryModel);
    idFields.forEach((f) => {
        if (insert[f.name] === undefined) {
            if (f.type === 'Int' || f.type === 'BigInt') {
                const currMax = Array.isArray(currentData)
                    ? Math.max(
                          ...[...currentData].map((item) => {
                              const idv = parseInt(item[f.name]);
                              return isNaN(idv) ? 0 : idv;
                          }),
                      )
                    : 0;
                insert[f.name] = currMax + 1;
            } else {
                insert[f.name] = crypto.randomUUID();
            }
        }
    });

    insert.$optimistic = true;

    if (logging) {
        log(logging, `Applying optimistic create for ${queryModel}: ${JSON.stringify(insert)}`);
    }

    return [insert, ...(Array.isArray(currentData) ? currentData : [])];
}

function updateMutate(
    queryModel: string,
    currentData: any,
    mutateModel: string,
    mutateArgs: any,
    schema: SchemaDef,
    logging: Logger | undefined,
) {
    if (!currentData || typeof currentData !== 'object') {
        return undefined;
    }

    if (!mutateArgs?.where || typeof mutateArgs.where !== 'object') {
        return undefined;
    }

    if (!mutateArgs?.data || typeof mutateArgs.data !== 'object') {
        return undefined;
    }

    if (!idFieldsMatch(mutateModel, currentData, mutateArgs.where, schema)) {
        return undefined;
    }

    const modelFields = schema.models[queryModel]?.fields;
    if (!modelFields) {
        return undefined;
    }

    let updated = false;
    let resultData = currentData;

    for (const [key, value] of Object.entries<any>(mutateArgs.data)) {
        const fieldInfo = modelFields[key];
        if (!fieldInfo) {
            continue;
        }

        if (fieldInfo.relation && !value?.connect) {
            // relation field but without "connect"
            continue;
        }

        if (!updated) {
            // clone
            resultData = { ...currentData };
        }

        if (fieldInfo.relation) {
            // deal with "connect"
            assignForeignKeyFields(fieldInfo, resultData, value);
        } else {
            resultData[key] = clone(value);
        }
        resultData.$optimistic = true;
        updated = true;

        if (logging) {
            log(logging, `Applying optimistic update for ${queryModel}: ${JSON.stringify(resultData)}`);
        }
    }

    return updated ? resultData : undefined;
}

function upsertMutate(
    queryModel: string,
    currentData: any,
    model: string,
    args: { where: object; create: any; update: any },
    schema: SchemaDef,
    logging: Logger | undefined,
) {
    let updated = false;
    let resultData = currentData;

    if (Array.isArray(resultData)) {
        // check if we should create or update
        const foundIndex = resultData.findIndex((x) => idFieldsMatch(model, x, args.where, schema));
        if (foundIndex >= 0) {
            const updateResult = updateMutate(
                queryModel,
                resultData[foundIndex],
                model,
                { where: args.where, data: args.update },
                schema,
                logging,
            );
            if (updateResult) {
                // replace the found item with updated item
                resultData = [...resultData.slice(0, foundIndex), updateResult, ...resultData.slice(foundIndex + 1)];
                updated = true;
            }
        } else {
            const createResult = createMutate(queryModel, resultData, args.create, schema, logging);
            if (createResult) {
                resultData = createResult;
                updated = true;
            }
        }
    } else {
        // try update only
        const updateResult = updateMutate(
            queryModel,
            resultData,
            model,
            { where: args.where, data: args.update },
            schema,
            logging,
        );
        if (updateResult) {
            resultData = updateResult;
            updated = true;
        }
    }

    return updated ? resultData : undefined;
}

function deleteMutate(
    queryModel: string,
    currentData: any,
    mutateModel: string,
    mutateArgs: any,
    schema: SchemaDef,
    logging: Logger | undefined,
) {
    // TODO: handle mutation of nested reads?

    if (!currentData || !mutateArgs) {
        return undefined;
    }

    if (queryModel !== mutateModel) {
        return undefined;
    }

    let updated = false;
    let result = currentData;

    if (Array.isArray(currentData)) {
        for (const item of currentData) {
            if (idFieldsMatch(mutateModel, item, mutateArgs, schema)) {
                result = (result as unknown[]).filter((x) => x !== item);
                updated = true;
                if (logging) {
                    log(logging, `Applying optimistic delete for ${queryModel}: ${JSON.stringify(item)}`);
                }
            }
        }
    } else {
        if (idFieldsMatch(mutateModel, currentData, mutateArgs, schema)) {
            result = null;
            updated = true;
            if (logging) {
                log(logging, `Applying optimistic delete for ${queryModel}: ${JSON.stringify(currentData)}`);
            }
        }
    }

    return updated ? result : undefined;
}

function idFieldsMatch(model: string, x: any, y: any, schema: SchemaDef) {
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') {
        return false;
    }
    const idFields = getIdFields(schema, model);
    if (idFields.length === 0) {
        return false;
    }
    return idFields.every((f) => x[f.name] === y[f.name]);
}

function assignForeignKeyFields(field: FieldDef, resultData: any, mutationData: any) {
    // convert "connect" like `{ connect: { id: '...' } }` to foreign key fields
    // assignment: `{ userId: '...' }`
    if (!mutationData?.connect) {
        return;
    }

    if (!field.relation?.fields || !field.relation.references) {
        return;
    }

    for (const [idField, fkField] of zip(field.relation.references, field.relation.fields)) {
        if (idField in mutationData.connect) {
            resultData[fkField] = mutationData.connect[idField];
        }
    }
}

function getIdFields(schema: SchemaDef, model: string) {
    return (schema.models[model]?.idFields ?? []).map((f) => schema.models[model]!.fields[f]!);
}
