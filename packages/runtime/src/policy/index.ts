/* eslint-disable @typescript-eslint/no-explicit-any */

import { prismaClientProxyHandler } from './handler';
import {
    AuthUser,
    FieldInfo,
    PolicyOperationKind,
    QueryContext,
} from '../types';

export type WithPolicyContext = {
    user?: AuthUser;
};

type PolicyFunc = (context: QueryContext) => any;

export type PolicyDef = {
    guard: Record<string, Record<PolicyOperationKind, PolicyFunc>>;
    fieldMapping: Record<string, Record<string, FieldInfo>>;
};

export function withPolicy<DbClient = any>(
    prisma: DbClient,
    policy: PolicyDef,
    context: WithPolicyContext
): DbClient {
    return new Proxy(
        prisma,
        prismaClientProxyHandler(prisma, policy, context.user)
    );
}
