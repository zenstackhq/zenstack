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
 * Options for @see withPolicy
 */
export type WithPolicyOptions = {
    /**
     * Policy definition
     */
    policy?: PolicyDef;

    /**
     * Model metatadata
     */
    modelMeta?: ModelMeta;

    /**
     * Whether to log Prisma query
     */
    logPrismaQuery?: boolean;
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
    options?: WithPolicyOptions
): DbClient {
    const _policy = options?.policy ?? getDefaultPolicy();
    const _modelMeta = options?.modelMeta ?? getDefaultModelMeta();
    return makeProxy(
        prisma,
        _modelMeta,
        (_prisma, model) =>
            new PolicyProxyHandler(
                _prisma as DbClientContract,
                _policy,
                _modelMeta,
                model,
                context?.user,
                options?.logPrismaQuery
            ),
        'policy'
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
