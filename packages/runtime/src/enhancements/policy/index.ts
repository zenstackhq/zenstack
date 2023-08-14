/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */

import path from 'path';
import semver from 'semver';
import { PRISMA_MINIMUM_VERSION } from '../../constants';
import { AuthUser, DbClientContract } from '../../types';
import { hasAllFields } from '../../validation';
import { getDefaultModelMeta } from '../model-meta';
import { makeProxy } from '../proxy';
import type { ModelMeta, PolicyDef, ZodSchemas } from '../types';
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
     * Zod schemas for validation
     */
    zodSchemas?: ZodSchemas;

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
    if (!prisma) {
        throw new Error('Invalid prisma instance');
    }

    const prismaVer = (prisma as any)._clientVersion;
    if (prismaVer && semver.lt(prismaVer, PRISMA_MINIMUM_VERSION)) {
        console.warn(
            `ZenStack requires Prisma version "${PRISMA_MINIMUM_VERSION}" or higher. Detected version is "${prismaVer}".`
        );
    }

    const _policy = options?.policy ?? getDefaultPolicy();
    const _modelMeta = options?.modelMeta ?? getDefaultModelMeta();
    const _zodSchemas = options?.zodSchemas ?? getDefaultZodSchemas();

    // validate user context
    if (context?.user) {
        const idFields = getIdFields(_modelMeta, 'User', true);
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

function getDefaultPolicy(): PolicyDef {
    try {
        return require('.zenstack/policy').default;
    } catch {
        if (process.env.ZENSTACK_TEST === '1') {
            try {
                // special handling for running as tests, try resolving relative to CWD
                return require(path.join(process.cwd(), 'node_modules', '.zenstack', 'policy')).default;
            } catch {
                throw new Error(
                    'Policy definition cannot be loaded from default location. Please make sure "zenstack generate" has been run.'
                );
            }
        }
        throw new Error(
            'Policy definition cannot be loaded from default location. Please make sure "zenstack generate" has been run.'
        );
    }
}

function getDefaultZodSchemas(): ZodSchemas | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('.zenstack/zod');
    } catch {
        if (process.env.ZENSTACK_TEST === '1') {
            try {
                // special handling for running as tests, try resolving relative to CWD
                return require(path.join(process.cwd(), 'node_modules', '.zenstack', 'zod'));
            } catch {
                return undefined;
            }
        }
        return undefined;
    }
}
