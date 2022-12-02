import { Service } from '@zenstackhq/runtime/server';
import { compare } from 'bcryptjs';

async function verifyPassword(password: string, hashedPassword: string) {
    return compare(password, hashedPassword);
}

export class AuthorizeError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export function authorize(service: Service) {
    return async (
        credentials: Record<'email' | 'password', string> | undefined
    ) => {
        if (!credentials) {
            throw new AuthorizeError('Missing credentials');
        }

        if (!credentials.email) {
            throw new AuthorizeError('"email" is required in credentials');
        }

        if (!credentials.password) {
            throw new AuthorizeError('"password" is required in credentials');
        }

        const maybeUser = await service.db.user.findFirst({
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

        const isValid = await verifyPassword(
            credentials.password,
            maybeUser.password
        );

        if (!isValid) {
            return null;
        }

        return {
            id: maybeUser.id,
            email: maybeUser.email,
        };
    };
}
