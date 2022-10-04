import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { Authorize, NextAuthAdapter as Adapter } from '@zenstack/auth';
import { client } from '@zenstack';

export const authOptions: NextAuthOptions = {
    // Configure one or more authentication providers

    adapter: Adapter(client),

    session: {
        strategy: 'jwt',
    },

    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_ID!,
            clientSecret: process.env.GOOGLE_SECRET!,
        }),
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
            authorize: Authorize(client),
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
};

export default NextAuth(authOptions);
