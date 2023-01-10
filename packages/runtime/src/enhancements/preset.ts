import { withOmit } from './omit';
import { withPassword } from './password';
import { withPolicy, WithPolicyContext } from './policy';
import { ModelMeta, PolicyDef } from './types';

/**
 * Gets an preset enhanced Prisma client including access policy, validation, omit and password support.
 * It's a shortcut for calling withPolicy(withOmit(withPassword(prisma, ...))).
 */
export function withPresets<DbClient extends object>(
    prisma: DbClient,
    context?: WithPolicyContext,
    policy?: PolicyDef,
    modelMeta?: ModelMeta
) {
    return withPolicy(withOmit(withPassword(prisma, modelMeta), modelMeta), context, policy, modelMeta);
}
