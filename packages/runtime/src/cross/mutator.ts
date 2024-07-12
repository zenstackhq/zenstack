/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuid } from 'uuid';
import {
    ModelDataVisitor,
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
    if (['count', 'aggregate', 'groupBy'].includes(queryOp)) {
        // only findXXX results are applicable
        return undefined;
    }

    let resultData = queryData;
    let updated = false;

    const visitor = new NestedWriteVisitor(modelMeta, {
        create: (model, args) => {
            if (model === queryModel) {
                const r = createMutate(queryModel, queryOp, resultData, args, modelMeta, logging);
                if (r) {
                    resultData = r;
                    updated = true;
                }
            }
        },

        createMany: (model, args) => {
            if (model === queryModel && args?.data) {
                for (const oneArg of enumerate(args.data)) {
                    const r = createMutate(queryModel, queryOp, resultData, oneArg, modelMeta, logging);
                    if (r) {
                        resultData = r;
                        updated = true;
                    }
                }
            }
        },

        update: (model, args) => {
            if (model === queryModel) {
                const r = updateMutate(queryModel, resultData, model, args, modelMeta, logging);
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

    return updated ? resultData : undefined;
}

function createMutate(
    queryModel: string,
    queryOp: string,
    currentData: any,
    newData: any,
    modelMeta: ModelMeta,
    logging: boolean
) {
    if (!newData) {
        return undefined;
    }

    if (queryOp !== 'findMany') {
        return undefined;
    }

    const modelFields = getFields(modelMeta, queryModel);
    if (!modelFields) {
        return undefined;
    }

    const insert: any = {};
    const newDataFields = Object.keys(newData);

    Object.entries(modelFields).forEach(([name, field]) => {
        if (field.isDataModel) {
            // only include scalar fields
            return;
        }
        if (newDataFields.includes(name)) {
            insert[name] = newData[name];
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
    if (!currentData) {
        return undefined;
    }

    if (!mutateArgs?.where || !mutateArgs?.data) {
        return undefined;
    }

    let updated = false;

    for (const item of enumerate(currentData)) {
        const visitor = new ModelDataVisitor(modelMeta);
        visitor.visit(queryModel, item, (model, _data, scalarData) => {
            if (model === mutateModel && idFieldsMatch(model, scalarData, mutateArgs.where, modelMeta)) {
                Object.keys(item).forEach((k) => {
                    if (mutateArgs.data[k] !== undefined) {
                        item[k] = mutateArgs.data[k];
                    }
                });
                item.$optimistic = true;
                updated = true;
                if (logging) {
                    console.log(`Optimistic update for ${queryModel}:`, item);
                }
            }
        });
    }

    return updated ? clone(currentData) /* ensures new object identity */ : undefined;
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
