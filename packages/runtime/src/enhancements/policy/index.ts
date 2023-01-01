/* eslint-disable @typescript-eslint/no-explicit-any */

import { AuthUser, DbClientContract } from '../../types';
import { getDefaultModelMeta } from '../model-meta';
import { makeProxy } from '../proxy';
import { ModelMeta, PolicyDef } from '../types';
import { PolicyProxyHandler } from './handler';

/**
 * Context for evaluating access policies
 */
export type WithPolicyContext = {
    user?: AuthUser;
};

/**
 * Gets an enhanced Prisma client with access policy check.
 *
 * @param prisma The original Prisma client
 * @param context The policy evaluation context
 * @param policy The policy definition, will be loaded from default location if not provided
 * @param modelMeta The model metadata, will be loaded from default location if not provided
 */
export function withPolicy<DbClient extends object>(
    prisma: DbClient,
    context?: WithPolicyContext,
    policy?: PolicyDef,
    modelMeta?: ModelMeta
): DbClient {
    return makeProxy(
        prisma,
        (_prisma, model) =>
            new PolicyProxyHandler(
                _prisma as DbClientContract,
                policy ?? getDefaultPolicy(),
                modelMeta ?? getDefaultModelMeta(),
                model,
                context?.user
            )
    );
}

function getDefaultPolicy(): PolicyDef {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('.zenstack/policy').default;
    } catch {
        throw new Error('Policy definition cannot be loaded from default location');
    }
}
