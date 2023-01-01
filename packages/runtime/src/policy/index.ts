/* eslint-disable @typescript-eslint/no-explicit-any */

import { getDefaultModelMeta } from '../enhancements/model-meta';
import { makeProxy } from '../enhancements/proxy';
import { ModelMeta, PolicyDef } from '../enhancements/types';
import { AuthUser, DbClientContract } from '../types';
import { PrismaModelHandler } from './handler';

export type WithPolicyContext = {
    user?: AuthUser;
};

export function withPolicy<DbClient extends object>(
    prisma: DbClient,
    context?: WithPolicyContext,
    policy?: PolicyDef,
    modelMeta?: ModelMeta
): DbClient {
    return makeProxy(
        prisma,
        (_prisma, model) =>
            new PrismaModelHandler(
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
        throw new Error('Policy definition cannot be loaded');
    }
}
