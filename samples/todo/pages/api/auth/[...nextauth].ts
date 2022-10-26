import NextAuth, { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import {
    authorize,
    NextAuthAdapter as Adapter,
} from '@zenstackhq/runtime/auth';
import service from '@zenstackhq/runtime';
import { nanoid } from 'nanoid';
import { SpaceUserRole } from '@zenstackhq/runtime/types';

export const authOptions: NextAuthOptions = {
    // Configure one or more authentication providers

    adapter: Adapter(service),

    session: {
        strategy: 'jwt',
    },

    providers: [
        CredentialsProvider({
            credentials: {
                email: {
                    label: 'Email Address',
                    type: 'email',
                    placeholder: 'john.doe@example.com',
                },
                password: {
                    label: 'Password',
                    type: 'password',
                    placeholder: 'Your super secure password',
                },
            },
            authorize: authorize(service, true),
        }),
    ],

    callbacks: {
        async session({ session, token }) {
            return {
                ...session,
                user: {
                    ...session.user,
                    id: token.sub!,
                },
            };
        },
    },

    events: {
        async signIn({ user }: { user: User }) {
            const spaceCount = await service.db.spaceUser.count({
                where: {
                    userId: user.id,
                },
            });
            if (spaceCount > 0) {
                return;
            }

            console.log(
                `User ${user.id} doesn't belong to any space. Creating one.`
            );
            const space = await service.db.space.create({
                data: {
                    name: `${user.name || user.email}'s space`,
                    slug: nanoid(8),
                    members: {
                        create: [
                            {
                                userId: user.id,
                                role: SpaceUserRole.ADMIN,
                            },
                        ],
                    },
                },
            });
            console.log(`Space created:`, space);
        },
    },
};

export default NextAuth(authOptions);
