import { withOmit, WithOmitOptions } from './omit';
import { withPassword, WithPasswordOptions } from './password';
import { withPolicy, WithPolicyContext, WithPolicyOptions } from './policy';

/**
 * Options @see withPresets
 */
export type WithPresetsOptions = WithPolicyOptions & WithPasswordOptions & WithOmitOptions;

/**
 * Gets a Prisma client enhanced with all essential behaviors, including access
 * policy, field validation, field omission and password hashing.
 *
 * It's a shortcut for calling withOmit(withPassword(withPolicy(prisma, options))).
 *
 * @param prisma The Prisma client to enhance.
 * @param context The context to for evaluating access policies.
 * @param options Options.
 */
export function withPresets<DbClient extends object>(
    prisma: DbClient,
    context?: WithPolicyContext,
    options?: WithPresetsOptions
) {
    return withPolicy(withOmit(withPassword(prisma, options), options), context, options);
}
