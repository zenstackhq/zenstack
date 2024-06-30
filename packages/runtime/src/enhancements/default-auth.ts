/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FieldInfo, NestedWriteVisitor, PrismaWriteActionType, enumerate, getFields, requireField } from '../cross';
import { clone } from '../cross';
import { DbClientContract } from '../types';
import { EnhancementContext, InternalEnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, PrismaProxyActions, makeProxy } from './proxy';
import { isUnsafeMutate } from './utils';

/**
 * Gets an enhanced Prisma client that supports `@default(auth())` attribute.
 *
 * @private
 */
export function withDefaultAuth<DbClient extends object>(
    prisma: DbClient,
    options: InternalEnhancementOptions,
    context: EnhancementContext = {}
): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new DefaultAuthHandler(_prisma as DbClientContract, model, options, context),
        'defaultAuth'
    );
}

class DefaultAuthHandler extends DefaultPrismaProxyHandler {
    private readonly userContext: any;

    constructor(
        prisma: DbClientContract,
        model: string,
        options: InternalEnhancementOptions,
        private readonly context: EnhancementContext
    ) {
        super(prisma, model, options);

        this.userContext = this.context.user;
    }

    // base override
    protected async preprocessArgs(action: PrismaProxyActions, args: any) {
        const actionsOfInterest: PrismaProxyActions[] = ['create', 'createMany', 'update', 'updateMany', 'upsert'];
        if (actionsOfInterest.includes(action)) {
            const newArgs = await this.preprocessWritePayload(this.model, action as PrismaWriteActionType, args);
            return newArgs;
        }
        return args;
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        const newArgs = clone(args);

        const processCreatePayload = (model: string, data: any) => {
            const fields = getFields(this.options.modelMeta, model);
            for (const fieldInfo of Object.values(fields)) {
                if (fieldInfo.name in data) {
                    // create payload already sets field value
                    continue;
                }

                if (!fieldInfo.defaultValueProvider) {
                    // field doesn't have a runtime default value provider
                    continue;
                }

                const authDefaultValue = this.getDefaultValueFromAuth(fieldInfo);
                if (authDefaultValue !== undefined) {
                    // set field value extracted from `auth()`
                    this.setAuthDefaultValue(fieldInfo, model, data, authDefaultValue);
                }
            }
        };

        // visit create payload and set default value to fields using `auth()` in `@default()`
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            create: (model, data) => {
                processCreatePayload(model, data);
            },

            upsert: (model, data) => {
                processCreatePayload(model, data.create);
            },

            createMany: (model, args) => {
                for (const item of enumerate(args.data)) {
                    processCreatePayload(model, item);
                }
            },
        });

        await visitor.visit(model, action, newArgs);
        return newArgs;
    }

    private setAuthDefaultValue(fieldInfo: FieldInfo, model: string, data: any, authDefaultValue: unknown) {
        if (fieldInfo.isForeignKey && fieldInfo.relationField && fieldInfo.relationField in data) {
            // if the field is a fk, and the relation field is already set, we should not override it
            return;
        }

        if (fieldInfo.isForeignKey && !isUnsafeMutate(model, data, this.options.modelMeta)) {
            // if the field is a fk, and the create payload is not unsafe, we need to translate
            // the fk field setting to a `connect` of the corresponding relation field
            const relFieldName = fieldInfo.relationField;
            if (!relFieldName) {
                throw new Error(
                    `Field \`${fieldInfo.name}\` is a foreign key field but no corresponding relation field is found`
                );
            }
            const relationField = requireField(this.options.modelMeta, model, relFieldName);

            // construct a `{ connect: { ... } }` payload
            let connect = data[relationField.name]?.connect;
            if (!connect) {
                connect = {};
                data[relationField.name] = { connect };
            }

            // sets the opposite fk field to value `authDefaultValue`
            const oppositeFkFieldName = this.getOppositeFkFieldName(relationField, fieldInfo);
            if (!oppositeFkFieldName) {
                throw new Error(
                    `Cannot find opposite foreign key field for \`${fieldInfo.name}\` in relation field \`${relFieldName}\``
                );
            }
            connect[oppositeFkFieldName] = authDefaultValue;
        } else {
            // set default value directly
            data[fieldInfo.name] = authDefaultValue;
        }
    }

    private getOppositeFkFieldName(relationField: FieldInfo, fieldInfo: FieldInfo) {
        if (!relationField.foreignKeyMapping) {
            return undefined;
        }
        const entry = Object.entries(relationField.foreignKeyMapping).find(([, v]) => v === fieldInfo.name);
        return entry?.[0];
    }

    private getDefaultValueFromAuth(fieldInfo: FieldInfo) {
        if (!this.userContext) {
            throw new Error(`Evaluating default value of field \`${fieldInfo.name}\` requires a user context`);
        }
        return fieldInfo.defaultValueProvider?.(this.userContext);
    }
}
