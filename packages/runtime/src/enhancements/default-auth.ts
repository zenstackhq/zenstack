/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { FieldInfo, NestedWriteVisitor, PrismaWriteActionType, enumerate, getFields } from '../cross';
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
    private readonly userContext: any;

    constructor(
        prisma: DbClientContract,
        model: string,
        private readonly options: EnhancementOptions,
        private readonly context?: EnhancementContext
    ) {
        super(prisma, model);
        this.db = prisma;

        if (!this.context?.user) {
            throw new Error(`Using \`auth()\` in \`@default\` requires a user context`);
        }

        this.userContext = this.context.user;
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

        await visitor.visit(model, action, args);
    }

    private getDefaultValueFromAuth(fieldInfo: FieldInfo) {
        return fieldInfo.defaultValueProvider?.(this.userContext);
    }
}
