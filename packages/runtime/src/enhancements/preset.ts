import { EnhancementOptions, enhance } from './enhance';
import { WithPolicyContext } from './policy';

/**
 * Gets a Prisma client enhanced with all essential behaviors, including access
 * policy, field validation, field omission and password hashing.
 *
 * It's a shortcut for calling withOmit(withPassword(withPolicy(prisma, options))).
 *
 * @param prisma The Prisma client to enhance.
 * @param context The context to for evaluating access policies.
 * @param options Options.
 *
 * @deprecated Use {@link enhance} instead
 */
export function withPresets<DbClient extends object>(
    prisma: DbClient,
    context?: WithPolicyContext,
    options?: EnhancementOptions
) {
    return enhance(prisma, context, options);
}
