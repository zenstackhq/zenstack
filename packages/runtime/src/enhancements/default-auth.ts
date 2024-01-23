/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import deepcopy from 'deepcopy';
import { NestedWriteVisitor, PrismaWriteActionType, FieldInfo } from '../cross';
import { DbClientContract } from '../types';
import { EnhancementContext, EnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, PrismaProxyActions, makeProxy } from './proxy';

/**
 * Gets an enhanced Prisma client that supports `@default(auth())` attribute.
 *
 * @private
 */
export function withDefaultAuth<DbClient extends object>(
    prisma: DbClient,
    options: EnhancementOptions,
    context?: EnhancementContext
): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new DefaultAuthHandler(_prisma as DbClientContract, model, options, context),
        'defaultAuth'
    );
}

class DefaultAuthHandler extends DefaultPrismaProxyHandler {
    private readonly db: DbClientContract;
    constructor(
        prisma: DbClientContract,
        model: string,
        private readonly options: EnhancementOptions,
        private readonly context?: EnhancementContext
    ) {
        super(prisma, model);
        this.db = prisma;
    }

    // base override
    protected async preprocessArgs(action: PrismaProxyActions, args: any) {
        const actionsOfInterest: PrismaProxyActions[] = ['create', 'createMany', 'update', 'updateMany', 'upsert'];
        if (actionsOfInterest.includes(action)) {
            await this.preprocessWritePayload(this.model, action as PrismaWriteActionType, args);
        }
        return args;
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            field: async (field, action, data, context) => {
                const userContext = this.context?.user;
                if (!userContext) {
                    throw new Error(`Invalid user context`);
                }
                const fields = this.options.modelMeta.fields[model];
                const isDefaultAuthField = (fieldInfo: FieldInfo) =>
                    fieldInfo.attributes?.find((attr) => attr.name === '@default' && attr.args?.[0]?.name === 'auth()');
                const defaultAuthSelectorFields = Object.fromEntries(
                    Object.entries(fields)
                        .filter(([_, fieldInfo]) => isDefaultAuthField(fieldInfo))
                        .map(([field, fieldInfo]) => [
                            field,
                            fieldInfo.attributes?.find((attr) => attr.name === '@default')?.args[0]?.value as
                                | string
                                | undefined,
                        ])
                );
                const defaultAuthFields = Object.fromEntries(
                    Object.entries(defaultAuthSelectorFields).map(([field, selector]) => [
                        field,
                        selector ? userContext[selector] : userContext,
                    ])
                );
                console.log('defaultAuthFields :', defaultAuthFields);
                for (const [field, defaultValue] of Object.entries(defaultAuthFields)) {
                    // const fieldInfo = fields[field];
                    // console.log('fieldInfo :', fieldInfo);
                    // console.log('isForeignKey :', fieldInfo.isForeignKey);
                    // if (fieldInfo.isForeignKey) {
                    //     console.log('field :', field);
                    //     console.log('defaultValue :', defaultValue);
                    //     const data = getConnectDefaultValue(fields, field, defaultValue);
                    //     const connectedField = Object.keys(data)[0];
                    //     console.log('data : ', data);
                    //     context.parent[connectedField] = data[connectedField];
                    // } else {
                    context.parent[field] = defaultValue;
                    // }
                }
            },
        });

        await visitor.visit(model, action, args);
    }
}

// function hasForeignKeyMapping(fieldInfo: FieldInfo) {
//     return fieldInfo.foreignKeyMapping !== undefined;
// }

// function getConnectDefaultValue(fields: Record<string, FieldInfo>, field: string, defaultValue: unknown) {
//     for (const key in fields) {
//         const fieldInfo = fields[key];
//         if (hasForeignKeyMapping(fieldInfo)) {
//             const connectedRawValue = { connect: fieldInfo.foreignKeyMapping! };
//             const connectedValue = replaceFirstValue(connectedRawValue, defaultValue);
//             console.log('old data :', { [fieldInfo.name]: connectedRawValue });
//             return { [fieldInfo.name]: connectedValue };
//         }
//     }
//     return {};
// }

// function replaceFirstValue(obj: Record<string, any>, newValue: any) {
//     // Fonction récursive pour parcourir l'objet
//     function replaceFirstValueRecursive(currentObj: Record<string, any>) {
//         for (const key in currentObj) {
//             if (typeof currentObj[key] === 'object' && currentObj[key] !== null) {
//                 // Remplace la première valeur trouvée dans l'objet
//                 for (const nestedKey in currentObj[key]) {
//                     // eslint-disable-next-line no-prototype-builtins
//                     if (currentObj[key].hasOwnProperty(nestedKey)) {
//                         currentObj[key][nestedKey] = newValue;
//                         return;
//                     }
//                 }

//                 // Continue la recherche récursive
//                 replaceFirstValueRecursive(currentObj[key]);
//             }
//         }
//     }

//     // Clone l'objet pour ne pas modifier l'original
//     const clonedObj = JSON.parse(JSON.stringify(obj));

//     // Appelle la fonction récursive avec l'objet cloné
//     replaceFirstValueRecursive(clonedObj);

//     return clonedObj;
// }
