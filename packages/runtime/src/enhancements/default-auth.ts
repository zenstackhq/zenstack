/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
                    context.parent[field] = defaultValue;
                }
            },
        });

        await visitor.visit(model, action, args);
    }
}
