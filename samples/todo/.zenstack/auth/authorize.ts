import { ZenStackClient } from '../client';
import { hash, compare } from 'bcryptjs';

async function hashPassword(password: string) {
    const hashedPassword = await hash(password, 12);
    return hashedPassword;
}

async function verifyPassword(password: string, hashedPassword: string) {
    const isValid = await compare(password, hashedPassword);
    return isValid;
}

export function Authorize(client: ZenStackClient) {
    return async (
        credentials: Record<'email' | 'password', string> | undefined
    ) => {
        try {
            let maybeUser = await client.prisma.user.findFirst({
                where: {
                    email: credentials!.email,
                },
                select: {
                    id: true,
                    email: true,
                    password: true,
                    name: true,
                },
            });

            if (!maybeUser) {
                if (!credentials!.password || !credentials!.email) {
                    throw new Error('Invalid Credentials');
                }

                maybeUser = await client.prisma.user.create({
                    data: {
                        email: credentials!.email,
                        password: await hashPassword(credentials!.password),
                    },
                    select: {
                        id: true,
                        email: true,
                        password: true,
                        name: true,
                    },
                });
            } else {
                const isValid = await verifyPassword(
                    credentials!.password,
                    maybeUser.password
                );

                if (!isValid) {
                    throw new Error('Invalid Credentials');
                }
            }

            return {
                id: maybeUser.id,
                email: maybeUser.email,
                name: maybeUser.name,
            };
        } catch (error) {
            console.log(error);
            throw error;
        }
    };
}
