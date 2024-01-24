/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NestedWriteVisitor, PrismaWriteActionType, FieldInfo, AuthContextSelector } from '../cross';
import { DbClientContract } from '../types';
import { EnhancementContext, EnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, PrismaProxyActions, makeProxy } from './proxy';
import { deepGet } from './utils';

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
            const newArgs = await this.preprocessWritePayload(this.model, action as PrismaWriteActionType, args);
            return newArgs;
        }
        return args;
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        let newArgs = {};
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            create: (model, _data, _context) => {
                const userContext = this.context?.user;
                if (!userContext) {
                    throw new Error(`Invalid user context`);
                }
                const fields = this.options.modelMeta.fields[model];
                const defaultAuthSelectorFields: Record<string, AuthContextSelector> = Object.fromEntries(
                    Object.entries(fields)
                        .filter(([_, fieldInfo]) => this.isDefaultAuthField(fieldInfo))
                        .map(([field, fieldInfo]) => [field, this.getAuthSelector(fieldInfo)])
                );
                const defaultAuthFields = Object.fromEntries(
                    Object.entries(defaultAuthSelectorFields).map(([field, authSelector]) => [
                        field,
                        deepGet(userContext, authSelector, userContext),
                    ])
                );
                console.log('defaultAuthFields :', defaultAuthFields);
                newArgs = { ...args, data: { ...defaultAuthFields, ...args.data } };
            },
        });

        await visitor.visit(model, action, args);
        return newArgs;
    }

    private isDefaultAuthField(field: FieldInfo): boolean {
        return !!field.attributes?.find((attr) => attr.name === '@default' && attr.args?.[0]?.name === 'auth()');
    }

    private getAuthSelector(fieldInfo: FieldInfo): AuthContextSelector {
        return fieldInfo.attributes?.find((attr) => attr.name === '@default')?.args[0]?.value as AuthContextSelector;
    }
}
