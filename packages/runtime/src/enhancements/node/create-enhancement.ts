import semver from 'semver';
import { PRISMA_MINIMUM_VERSION } from '../../constants';
import { isDelegateModel, type ModelMeta } from '../../cross';
import type {
    DbClientContract,
    EnhancementContext,
    EnhancementKind,
    EnhancementOptions,
    ZodSchemas,
} from '../../types';
import { withDefaultAuth } from './default-auth';
import { withDelegate } from './delegate';
import { withJsonProcessor } from './json-processor';
import { Logger } from './logger';
import { withOmit } from './omit';
import { withPassword } from './password';
import { withEncrypted } from './encrypted';
import { policyProcessIncludeRelationPayload, withPolicy } from './policy';
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

    /**
     * A callback shared among enhancements to process the payload for including a relation
     * field. e.g.: `{ author: true }`.
     */
    processIncludeRelationPayload?: (
        prisma: DbClientContract,
        model: string,
        payload: unknown,
        options: InternalEnhancementOptions,
        context: EnhancementContext | undefined
    ) => Promise<void>;
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
    if (options.modelMeta.typeDefs) {
        allFields.push(
            ...Object.values(options.modelMeta.typeDefs).flatMap((typeDefInfo) => Object.values(typeDefInfo.fields))
        );
    }

    const hasPassword = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@password'));
    const hasEncrypted = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@encrypted'));
    const hasOmit = allFields.some((field) => field.attributes?.some((attr) => attr.name === '@omit'));
    const hasDefaultAuth = allFields.some((field) => field.defaultValueProvider);
    const hasTypeDefField = allFields.some((field) => field.isTypeDef);

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
            result = withDelegate(result, options, context);
        }
    }

    // password and encrypted enhancement must be applied prior to policy because it changes then length of the field
    // and can break validation rules like `@length`
    if (hasPassword && kinds.includes('password')) {
        // @password proxy
        result = withPassword(result, options);
    }

    if (hasEncrypted && kinds.includes('encrypted')) {
        if (!options.encryption) {
            throw new Error('Encryption options are required for @encrypted enhancement');
        }

        // @encrypted proxy
        result = withEncrypted(result, options);
    }

    // 'policy' and 'validation' enhancements are both enabled by `withPolicy`
    if (kinds.includes('policy') || kinds.includes('validation')) {
        result = withPolicy(result, options, context);

        // if any enhancement is to introduce an inclusion of a relation field, the
        // inclusion payload must be processed by the policy enhancement for injecting
        // access control rules

        // TODO: this is currently a global callback shared among all enhancements, which
        // is far from ideal

        options.processIncludeRelationPayload = policyProcessIncludeRelationPayload;

        if (kinds.includes('policy') && hasDefaultAuth) {
            // @default(auth()) proxy
            result = withDefaultAuth(result, options, context);
        }
    }

    if (hasOmit && kinds.includes('omit')) {
        // @omit proxy
        result = withOmit(result, options);
    }

    if (hasTypeDefField) {
        result = withJsonProcessor(result, options);
    }

    return result;
}
