/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import deepcopy from 'deepcopy';
import { FieldInfo, NestedWriteVisitor, PrismaWriteActionType, enumerate, getFields } from '../cross';
import { DbClientContract } from '../types';
import { EnhancementContext, InternalEnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, PrismaProxyActions, makeProxy } from './proxy';

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
        const newArgs = deepcopy(args);

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
                    data[fieldInfo.name] = authDefaultValue;
                }
            }
        };

        // visit create payload and set default value to fields using `auth()` in `@default()`
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            create: (model, data) => {
                processCreatePayload(model, data);
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

    private getDefaultValueFromAuth(fieldInfo: FieldInfo) {
        if (!this.userContext) {
            throw new Error(`Evaluating default value of field \`${fieldInfo.name}\` requires a user context`);
        }
        return fieldInfo.defaultValueProvider?.(this.userContext);
    }
}
