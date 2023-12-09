import { enhance, type AuthUser } from '@zenstackhq/runtime';
import { type Plugin } from 'graphql-yoga';

export function useZenStack<PrismaClient extends object>(
    db: PrismaClient
): Plugin<{ currentUser: AuthUser; db: PrismaClient }> {
    return {
        onContextBuilding() {
            return ({ context }) => {
                context.db = enhance(db, { user: context?.currentUser });
            };
        },
    };
}
