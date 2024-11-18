/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuid } from 'uuid';
import {
    FieldInfo,
    NestedWriteVisitor,
    enumerate,
    getFields,
    getIdFields,
    type ModelMeta,
    type PrismaWriteActionType,
} from '.';
import { clone } from './clone';

/**
 * Tries to apply a mutation to a query result.
 *
 * @param queryModel the model of the query
 * @param queryOp the operation of the query
 * @param queryData the result data of the query
 * @param mutationModel the model of the mutation
 * @param mutationOp the operation of the mutation
 * @param mutationArgs the arguments of the mutation
 * @param modelMeta the model metadata
 * @param logging whether to log the mutation application
 * @returns the updated query data if the mutation is applicable, otherwise undefined
 */
export async function applyMutation(
    queryModel: string,
    queryOp: string,
    queryData: any,
    mutationModel: string,
    mutationOp: PrismaWriteActionType,
    mutationArgs: any,
    modelMeta: ModelMeta,
    logging: boolean
) {
    if (!queryData || (typeof queryData !== 'object' && !Array.isArray(queryData))) {
        return undefined;
    }

    if (!queryOp.startsWith('find')) {
        // only findXXX results are applicable
        return undefined;
    }

    return await doApplyMutation(queryModel, queryData, mutationModel, mutationOp, mutationArgs, modelMeta, logging);
}

async function doApplyMutation(
    queryModel: string,
    queryData: any,
    mutationModel: string,
    mutationOp: PrismaWriteActionType,
    mutationArgs: any,
    modelMeta: ModelMeta,
    logging: boolean
) {
    let resultData = queryData;
    let updated = false;

    const visitor = new NestedWriteVisitor(modelMeta, {
        create: (model, args) => {
            if (
                model === queryModel &&
                Array.isArray(resultData) // "create" mutation is only relevant for arrays
            ) {
                const r = createMutate(queryModel, resultData, args, modelMeta, logging);
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
                    const r = createMutate(queryModel, resultData, oneArg, modelMeta, logging);
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
                const r = updateMutate(queryModel, resultData, model, args, modelMeta, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },

        upsert: (model, args) => {
            if (model === queryModel && args?.where && args?.create && args?.update) {
                const r = upsertMutate(queryModel, resultData, model, args, modelMeta, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },

        delete: (model, args) => {
            if (model === queryModel) {
                const r = deleteMutate(queryModel, resultData, model, args, modelMeta, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },
    });

    await visitor.visit(mutationModel, mutationOp, mutationArgs);

    const modelFields = getFields(modelMeta, queryModel);

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

            const r = await doApplyMutation(
                queryModel,
                item,
                mutationModel,
                mutationOp,
                mutationArgs,
                modelMeta,
                logging
            );

            if (r) {
                if (!arrayCloned) {
                    resultData = [...resultData];
                    arrayCloned = true;
                }
                resultData[i] = r;
                updated = true;
            }
        }
    } else {
        // iterate over each field and apply mutation to nested data models
        for (const [key, value] of Object.entries(resultData)) {
            const fieldInfo = modelFields[key];
            if (!fieldInfo?.isDataModel) {
                continue;
            }

            const r = await doApplyMutation(
                fieldInfo.type,
                value,
                mutationModel,
                mutationOp,
                mutationArgs,
                modelMeta,
                logging
            );

            if (r) {
                resultData = { ...resultData, [key]: r };
                updated = true;
            }
        }
    }

    return updated ? resultData : undefined;
}

function createMutate(queryModel: string, currentData: any, newData: any, modelMeta: ModelMeta, logging: boolean) {
    if (!newData) {
        return undefined;
    }

    const modelFields = getFields(modelMeta, queryModel);
    if (!modelFields) {
        return undefined;
    }

    const insert: any = {};
    const newDataFields = Object.keys(newData);

    Object.entries(modelFields).forEach(([name, field]) => {
        if (field.isDataModel && newData[name]) {
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
                }
            } else if (defaultAttr?.args?.[0]?.value !== undefined) {
                // other default value
                insert[name] = defaultAttr.args[0].value;
            }
        }
    });

    // add temp id value
    const idFields = getIdFields(modelMeta, queryModel, false);
    idFields.forEach((f) => {
        if (insert[f.name] === undefined) {
            if (f.type === 'Int' || f.type === 'BigInt') {
                const currMax = Array.isArray(currentData)
                    ? Math.max(
                          ...[...currentData].map((item) => {
                              const idv = parseInt(item[f.name]);
                              return isNaN(idv) ? 0 : idv;
                          })
                      )
                    : 0;
                insert[f.name] = currMax + 1;
            } else {
                insert[f.name] = uuid();
            }
        }
    });

    insert.$optimistic = true;

    if (logging) {
        console.log(`Optimistic create for ${queryModel}:`, insert);
    }
    return [insert, ...(Array.isArray(currentData) ? currentData : [])];
}

function updateMutate(
    queryModel: string,
    currentData: any,
    mutateModel: string,
    mutateArgs: any,
    modelMeta: ModelMeta,
    logging: boolean
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

    if (!idFieldsMatch(mutateModel, currentData, mutateArgs.where, modelMeta)) {
        return undefined;
    }

    const modelFields = getFields(modelMeta, queryModel);
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

        if (fieldInfo.isDataModel && !value?.connect) {
            // relation field but without "connect"
            continue;
        }

        if (!updated) {
            // clone
            resultData = { ...currentData };
        }

        if (fieldInfo.isDataModel) {
            // deal with "connect"
            assignForeignKeyFields(fieldInfo, resultData, value);
        } else {
            resultData[key] = clone(value);
        }
        resultData.$optimistic = true;
        updated = true;

        if (logging) {
            console.log(`Optimistic update for ${queryModel}:`, resultData);
        }
    }

    return updated ? resultData : undefined;
}

function upsertMutate(
    queryModel: string,
    currentData: any,
    model: string,
    args: { where: object; create: any; update: any },
    modelMeta: ModelMeta,
    logging: boolean
) {
    let updated = false;
    let resultData = currentData;

    if (Array.isArray(resultData)) {
        // check if we should create or update
        const foundIndex = resultData.findIndex((x) => idFieldsMatch(model, x, args.where, modelMeta));
        if (foundIndex >= 0) {
            const updateResult = updateMutate(
                queryModel,
                resultData[foundIndex],
                model,
                { where: args.where, data: args.update },
                modelMeta,
                logging
            );
            if (updateResult) {
                // replace the found item with updated item
                resultData = [...resultData.slice(0, foundIndex), updateResult, ...resultData.slice(foundIndex + 1)];
                updated = true;
            }
        } else {
            const createResult = createMutate(queryModel, resultData, args.create, modelMeta, logging);
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
            modelMeta,
            logging
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
    modelMeta: ModelMeta,
    logging: boolean
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
            if (idFieldsMatch(mutateModel, item, mutateArgs, modelMeta)) {
                result = (result as unknown[]).filter((x) => x !== item);
                updated = true;
                if (logging) {
                    console.log(`Optimistic delete for ${queryModel}:`, item);
                }
            }
        }
    } else {
        if (idFieldsMatch(mutateModel, currentData, mutateArgs, modelMeta)) {
            result = null;
            updated = true;
            if (logging) {
                console.log(`Optimistic delete for ${queryModel}:`, currentData);
            }
        }
    }

    return updated ? result : undefined;
}

function idFieldsMatch(model: string, x: any, y: any, modelMeta: ModelMeta) {
    if (!x || !y || typeof x !== 'object' || typeof y !== 'object') {
        return false;
    }
    const idFields = getIdFields(modelMeta, model, false);
    if (idFields.length === 0) {
        return false;
    }
    return idFields.every((f) => x[f.name] === y[f.name]);
}

function assignForeignKeyFields(field: FieldInfo, resultData: any, mutationData: any) {
    // convert "connect" like `{ connect: { id: '...' } }` to foreign key fields
    // assignment: `{ userId: '...' }`
    if (!mutationData?.connect) {
        return;
    }

    if (!field.foreignKeyMapping) {
        return;
    }

    for (const [idField, fkField] of Object.entries(field.foreignKeyMapping)) {
        if (idField in mutationData.connect) {
            resultData[fkField] = mutationData.connect[idField];
        }
    }
}
