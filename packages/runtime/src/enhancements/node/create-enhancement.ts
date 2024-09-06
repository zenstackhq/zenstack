import semver from 'semver';
import { PRISMA_MINIMUM_VERSION } from '../../constants';
import { isDelegateModel, type ModelMeta } from '../../cross';
import type { EnhancementContext, EnhancementKind, EnhancementOptions, ZodSchemas } from '../../types';
import { withDefaultAuth } from './default-auth';
import { withDelegate } from './delegate';
import { Logger } from './logger';
import { withOmit } from './omit';
import { withPassword } from './password';
import { withPolicy } from './policy';
import type { PolicyDef } from './types';

/**
 * All enhancement kinds
 */
const ALL_ENHANCEMENTS: EnhancementKind[] = ['password', 'omit', 'policy', 'validation', 'delegate'];

/**
 * Options for {@link createEnhancement}
 *
 * @private
 */
export type InternalEnhancementOptions = EnhancementOptions & {
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
     * The Node module that contains PrismaClient
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaModule: any;
};

/**
 * Gets a Prisma client enhanced with all enhancement behaviors, including access
 * policy, field validation, field omission and password hashing.
 *
 * @private
 *
 * @param prisma The Prisma client to enhance.
 * @param context Context.
 * @param options Options.
 */
export function createEnhancement<DbClient extends object>(
    prisma: DbClient,
    options: InternalEnhancementOptions,
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

    // TODO: move the detection logic into each enhancement
    // TODO: how to properly cache the detection result?
    const allFields = Object.values(options.modelMeta.models).flatMap((modelInfo) => Object.values(modelInfo.fields));
    const hasPassword = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@password'));
    const hasOmit = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@omit'));
    const hasDefaultAuth = allFields.some((field) => field.defaultValueProvider);

    const kinds = options.kinds ?? ALL_ENHANCEMENTS;
    let result = prisma;

    // delegate proxy needs to be wrapped inside policy proxy, since it may translate `deleteMany`
    // and `updateMany` to plain `delete` and `update`
    if (Object.values(options.modelMeta.models).some((model) => isDelegateModel(options.modelMeta, model.name))) {
        if (!kinds.includes('delegate')) {
            const logger = new Logger(prisma);
            logger.warn(
                'Your ZModel contains delegate models but "delegate" enhancement kind is not enabled. This may result in unexpected behavior.'
            );
        } else {
            result = withDelegate(result, options);
        }
    }

    // password enhancement must be applied prior to policy because it changes then length of the field
    // and can break validation rules like `@length`
    if (hasPassword && kinds.includes('password')) {
        // @password proxy
        result = withPassword(result, options);
    }

    // 'policy' and 'validation' enhancements are both enabled by `withPolicy`
    if (kinds.includes('policy') || kinds.includes('validation')) {
        result = withPolicy(result, options, context);
        if (kinds.includes('policy') && hasDefaultAuth) {
            // @default(auth()) proxy
            result = withDefaultAuth(result, options, context);
        }
    }

    if (hasOmit && kinds.includes('omit')) {
        // @omit proxy
        result = withOmit(result, options);
    }

    return result;
}
