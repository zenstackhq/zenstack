import semver from 'semver';
import { PRISMA_MINIMUM_VERSION } from '../constants';
import { ModelMeta } from '../cross';
import type { AuthUser } from '../types';
import { withOmit } from './omit';
import { withPassword } from './password';
import { withPolicy } from './policy';
import type { ErrorTransformer } from './proxy';
import type { PolicyDef, ZodSchemas } from './types';
import { withDefaultAuth } from './default-auth';

/**
 * Kinds of enhancements to `PrismaClient`
 */
export enum EnhancementKind {
    Password = 'password',
    Omit = 'omit',
    Policy = 'policy',
    DefaultAuth = 'defaultAuth',
}

/**
 * Transaction isolation levels: https://www.prisma.io/docs/orm/prisma-client/queries/transactions#transaction-isolation-level
 */
export type TransactionIsolationLevel =
    | 'ReadUncommitted'
    | 'ReadCommitted'
    | 'RepeatableRead'
    | 'Snapshot'
    | 'Serializable';

/**
 * Options for {@link createEnhancement}
 */
export type EnhancementOptions = {
    /**
     * Policy definition
     */
    policy: PolicyDef;

    /**
     * Model metadata
     */
    modelMeta: ModelMeta;

    /**
     * Zod schemas for validation
     */
    zodSchemas?: ZodSchemas;

    /**
     * Whether to log Prisma query
     */
    logPrismaQuery?: boolean;

    /**
     * The Node module that contains PrismaClient
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaModule: any;

    /**
     * The kinds of enhancements to apply. By default all enhancements are applied.
     */
    kinds?: EnhancementKind[];

    /**
     * Hook for transforming errors before they are thrown to the caller.
     */
    errorTransformer?: ErrorTransformer;

    /**
     * The `maxWait` option passed to `prisma.$transaction()` call for transactions initiated by ZenStack.
     */
    transactionMaxWait?: number;

    /**
     * The `timeout` option passed to `prisma.$transaction()` call for transactions initiated by ZenStack.
     */
    transactionTimeout?: number;

    /**
     * The `isolationLevel` option passed to `prisma.$transaction()` call for transactions initiated by ZenStack.
     */
    transactionIsolationLevel?: TransactionIsolationLevel;
};

/**
 * Context for creating enhanced `PrismaClient`
 */
export type EnhancementContext = {
    user?: AuthUser;
};

let hasPassword: boolean | undefined = undefined;
let hasOmit: boolean | undefined = undefined;
let hasDefaultAuth: boolean | undefined = undefined;

/**
 * Gets a Prisma client enhanced with all enhancement behaviors, including access
 * policy, field validation, field omission and password hashing.
 *
 * @param prisma The Prisma client to enhance.
 * @param context Context.
 * @param options Options.
 */
export function createEnhancement<DbClient extends object>(
    prisma: DbClient,
    options: EnhancementOptions,
    context?: EnhancementContext
) {
    if (!prisma) {
        throw new Error('Invalid prisma instance');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaVer = (prisma as any)._clientVersion;
    if (prismaVer && semver.lt(prismaVer, PRISMA_MINIMUM_VERSION)) {
        console.warn(
            `ZenStack requires Prisma version "${PRISMA_MINIMUM_VERSION}" or higher. Detected version is "${prismaVer}".`
        );
    }

    let result = prisma;

    if (
        process.env.ZENSTACK_TEST === '1' || // avoid caching in tests
        hasPassword === undefined ||
        hasOmit === undefined ||
        hasDefaultAuth === undefined
    ) {
        const allFields = Object.values(options.modelMeta.fields).flatMap((modelInfo) => Object.values(modelInfo));
        hasPassword = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@password'));
        hasOmit = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@omit'));
        hasDefaultAuth = allFields.some((field) =>
            field.attributes?.some((attr) => attr.name === '@default' && attr.args[0]?.name === 'auth()')
        );
    }

    const kinds = options.kinds ?? [
        EnhancementKind.Password,
        EnhancementKind.Omit,
        EnhancementKind.Policy,
        EnhancementKind.DefaultAuth,
    ];

    if (hasPassword && kinds.includes(EnhancementKind.Password)) {
        // @password proxy
        result = withPassword(result, options);
    }

    if (hasOmit && kinds.includes(EnhancementKind.Omit)) {
        // @omit proxy
        result = withOmit(result, options);
    }

    if (hasDefaultAuth && kinds.includes(EnhancementKind.DefaultAuth)) {
        // @default(auth()) proxy
        result = withDefaultAuth(result, options, context);
    }

    // policy proxy
    if (kinds.includes(EnhancementKind.Policy)) {
        result = withPolicy(result, options, context);
    }

    return result;
}
