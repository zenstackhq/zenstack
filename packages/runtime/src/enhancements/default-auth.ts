/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
    enumerate,
    getModelFields,
    resolveField,
    type ModelMeta,
    NestedWriteVisitor,
    PrismaWriteActionType,
} from '../cross';
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
    constructor(
        prisma: DbClientContract,
        model: string,
        private readonly options: EnhancementOptions,
        private readonly context?: EnhancementContext
    ) {
        super(prisma, model);
    }

    // base override
    protected async preprocessArgs(action: PrismaProxyActions, args: any) {
        const actionsOfInterest: PrismaProxyActions[] = ['create', 'createMany', 'update', 'updateMany', 'upsert'];
        if (args && args.data && actionsOfInterest.includes(action)) {
            await this.preprocessWritePayload(this.model, action as PrismaWriteActionType, args);
        }
        return args;
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            field: async (field, _action, _data, context) => {
                const defaultAuthAttr = field.attributes?.find(
                    (attr) =>
                        attr.name === '@default' &&
                        typeof attr.args[0]?.value === 'string' &&
                        attr.args[0]?.value.startsWith('auth()')
                );
                if (defaultAuthAttr && field.type === 'String') {
                    const authSelector = (defaultAuthAttr?.args[0]?.value as string).slice('auth()'.length);
                    // get auth selector and retrieve default value from context
                    const userContext = this.context?.user;
                    if (!userContext) {
                        throw new Error(`Invalid user context`);
                    }
                    const authValue = authSelector ? userContext[authSelector] : userContext;
                    context.parent[field.name] = authValue;
                }
            },
        });

        await visitor.visit(model, action, args);
    }
}
