import NextAuth, { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import {
    authorize,
    NextAuthAdapter as Adapter,
} from '@zenstackhq/generated/auth';
import service from '@zenstackhq/generated';

export const authOptions: NextAuthOptions = {
    // Configure one or more authentication providers

    adapter: Adapter(service),

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
            authorize: authorize(service),
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
