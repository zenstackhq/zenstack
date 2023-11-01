/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

import semver from 'semver';
import { PRISMA_MINIMUM_VERSION } from '../../constants';
import { ModelMeta } from '../../cross';
import { getDefaultModelMeta, getDefaultPolicy, getDefaultZodSchemas } from '../../loader';
import { AuthUser, DbClientContract } from '../../types';
import { hasAllFields } from '../../validation';
import { makeProxy } from '../proxy';
import type { CommonEnhancementOptions, PolicyDef, ZodSchemas } from '../types';
import { getIdFields } from '../utils';
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
export interface WithPolicyOptions extends CommonEnhancementOptions {
    /**
     * Policy definition
     */
    policy?: PolicyDef;

    /**
     * Model metadata
     */
    modelMeta?: ModelMeta;

    /**
     * Zod schemas for validation
     */
    zodSchemas?: ZodSchemas;

    /**
     * Whether to log Prisma query
     */
    logPrismaQuery?: boolean;
}

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
    if (!prisma) {
        throw new Error('Invalid prisma instance');
    }

    const prismaVer = (prisma as any)._clientVersion;
    if (prismaVer && semver.lt(prismaVer, PRISMA_MINIMUM_VERSION)) {
        console.warn(
            `ZenStack requires Prisma version "${PRISMA_MINIMUM_VERSION}" or higher. Detected version is "${prismaVer}".`
        );
    }

    const _policy = options?.policy ?? getDefaultPolicy(options?.loadPath);
    const _modelMeta = options?.modelMeta ?? getDefaultModelMeta(options?.loadPath);
    const _zodSchemas = options?.zodSchemas ?? getDefaultZodSchemas(options?.loadPath);

    // validate user context
    if (context?.user) {
        if (!_modelMeta.authModel) {
            throw new Error('Invalid model meta: missing auth model');
        }
        const idFields = getIdFields(_modelMeta, _modelMeta.authModel);
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
    }

    return makeProxy(
        prisma,
        _modelMeta,
        (_prisma, model) =>
            new PolicyProxyHandler(
                _prisma as DbClientContract,
                _policy,
                _modelMeta,
                _zodSchemas,
                model,
                context?.user,
                options?.logPrismaQuery
            ),
        'policy'
    );
}
