import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { PrismaClient, SpaceUserRole } from '@prisma/client';
import { compare } from 'bcryptjs';
import { nanoid } from 'nanoid';
import NextAuth, { NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GitHubProvider from 'next-auth/providers/github';
import { prisma } from 'server/db/client';

export const authOptions: NextAuthOptions = {
    // Configure one or more authentication providers

    adapter: PrismaAdapter(prisma),

    session: {
        strategy: 'jwt',
    },

    pages: {
        signIn: '/signin',
    },

    providers: [
        CredentialsProvider({
            credentials: {
                email: {
                    type: 'email',
                },
                password: {
                    type: 'password',
                },
            },
            authorize: authorize(prisma),
        }),

        GitHubProvider({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
            // @ts-ignore
            scope: 'read:user,user:email',
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
            const spaceCount = await prisma.spaceUser.count({
                where: {
                    userId: user.id,
                },
            });
            if (spaceCount > 0) {
                return;
            }

            console.log(`User ${user.id} doesn't belong to any space. Creating one.`);
            const space = await prisma.space.create({
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

function authorize(prisma: PrismaClient) {
    return async (credentials: Record<'email' | 'password', string> | undefined) => {
        if (!credentials) {
            throw new Error('Missing credentials');
        }

        if (!credentials.email) {
            throw new Error('"email" is required in credentials');
        }

        if (!credentials.password) {
            throw new Error('"password" is required in credentials');
        }

        const maybeUser = await prisma.user.findFirst({
            where: {
                email: credentials.email,
            },
            select: {
                id: true,
                email: true,
                password: true,
            },
        });

        if (!maybeUser || !maybeUser.password) {
            return null;
        }

        const isValid = await compare(credentials.password, maybeUser.password);

        if (!isValid) {
            return null;
        }

        return {
            id: maybeUser.id,
            email: maybeUser.email,
        };
    };
}

export default NextAuth(authOptions);
