import { enhance, type AuthUser } from '@zenstackhq/runtime';
import { type Plugin } from 'graphql-yoga';
import setup from './commands/setup';

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

export const commands = [setup];
