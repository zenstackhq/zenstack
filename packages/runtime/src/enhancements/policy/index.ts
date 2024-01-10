/* eslint-disable @typescript-eslint/no-explicit-any */

import { getIdFields } from '../../cross';
import { DbClientContract } from '../../types';
import { hasAllFields } from '../../validation';
import type { EnhancementContext, EnhancementOptions } from '../enhance';
import { makeProxy } from '../proxy';
import { PolicyProxyHandler } from './handler';

/**
 * Gets an enhanced Prisma client with access policy check.
 *
 * @param prisma The original Prisma client
 * @param context The policy evaluation context
 * @param policy The policy definition, will be loaded from default location if not provided
 * @param modelMeta The model metadata, will be loaded from default location if not provided
 *
 * @private
 */
export function withPolicy<DbClient extends object>(
    prisma: DbClient,
    options: EnhancementOptions,
    context?: EnhancementContext
): DbClient {
    const { modelMeta, policy } = options;

    // validate user context
    const userContext = context?.user;
    if (userContext && modelMeta.authModel) {
        const idFields = getIdFields(modelMeta, modelMeta.authModel);
        if (
            !hasAllFields(
                context.user,
                idFields.map((f) => f.name)
            )
        ) {
            throw new Error(
                `Invalid user context: must have valid ID field ${idFields.map((f) => `"${f.name}"`).join(', ')}`
            );
        }

        // validate user context for fields used in policy expressions
        const authSelector = policy.authSelector;
        if (authSelector) {
            Object.keys(authSelector).forEach((f) => {
                if (!(f in userContext)) {
                    console.warn(`User context does not have field "${f}" used in policy rules`);
                }
            });
        }
    }

    return makeProxy(
        prisma,
        modelMeta,
        (_prisma, model) => new PolicyProxyHandler(_prisma as DbClientContract, model, options, context),
        'policy',
        options?.errorTransformer
    );
}
