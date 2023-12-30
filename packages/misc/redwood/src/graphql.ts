import { ForbiddenError } from '@redwoodjs/graphql-server';
import {
    CrudFailureReason,
    EnhancementOptions,
    PrismaErrorCode,
    ValidationError,
    enhance,
    isPrismaClientKnownRequestError,
    type AuthUser,
} from '@zenstackhq/runtime';
import { type Plugin } from 'graphql-yoga';

/**
 * Plugin options
 */
export type ZenStackPluginOptions = EnhancementOptions;

/**
 * A GraphQLYoga plugin that adds a ZenStack-enhanced PrismaClient into the context
 * as `context.db`.
 * @param db The original PrismaClient.
 * @param getAuthUser A hook function for getting the current user. By default `context.currentUser` is used.
 * @param options Options for creating the enhanced PrismaClient. See https://zenstack.dev/docs/reference/runtime-api#enhance for more details.
 * @returns
 */
export function useZenStack<PrismaClient extends object>(
    db: PrismaClient,
    getAuthUser?: (currentUser: unknown) => Promise<AuthUser>,
    options?: ZenStackPluginOptions
): Plugin<{ currentUser: unknown; db: PrismaClient }> {
    return {
        onContextBuilding: () => {
            return async ({ context }) => {
                const user = getAuthUser ? await getAuthUser(context.currentUser) : (context.currentUser as AuthUser);
                context.db = enhance(
                    db,
                    { user },
                    {
                        errorTransformer: transformError,
                        ...options,
                    }
                );
            };
        },
    };
}

// Transforms ZenStack errors into appropriate RedwoodJS errors
function transformError(error: unknown) {
    if (isPrismaClientKnownRequestError(error) && error.code === PrismaErrorCode.CONSTRAINED_FAILED) {
        if (
            error.meta?.reason === CrudFailureReason.ACCESS_POLICY_VIOLATION ||
            error.meta?.reason === CrudFailureReason.RESULT_NOT_READABLE
        ) {
            return new ForbiddenError(error.message);
        } else if (error.meta?.reason === CrudFailureReason.DATA_VALIDATION_VIOLATION) {
            return new ValidationError(error.message);
        }
    }
    return error;
}
