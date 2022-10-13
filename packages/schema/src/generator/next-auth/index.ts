import { Context, Generator } from '../types';
import { Project } from 'ts-morph';
import * as path from 'path';
import colors from 'colors';

export default class NextAuthGenerator implements Generator {
    async generate(context: Context) {
        const project = new Project();

        this.generateIndex(project, context);
        this.generateAdapter(project, context);
        this.generateAuthorize(project, context);

        await project.save();

        console.log(colors.blue(`  ✔️ Next-auth adapter generated`));
    }

    generateIndex(project: Project, context: Context) {
        const sf = project.createSourceFile(
            path.join(context.outDir, 'src/auth/index.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addStatements([
            `export * from './next-auth-adapter';`,
            `export * from './authorize';`,
        ]);

        sf.formatText();
    }

    generateAdapter(project: Project, context: Context) {
        const content = `
        import { ZenStackService } from '..';
        import { Adapter } from 'next-auth/adapters';
        import { Prisma } from '../../.prisma';
        
        export function NextAuthAdapter(service: ZenStackService): Adapter {
            const db = service.db;
            return {
                createUser: (data) => db.user.create({ data: data as Prisma.UserCreateInput }),
                getUser: (id) => db.user.findUnique({ where: { id } }),
                getUserByEmail: (email) => db.user.findUnique({ where: { email } }),
                async getUserByAccount(provider_providerAccountId) {
                    const account = await db.account.findUnique({
                        where: { provider_providerAccountId },
                        select: { user: true },
                    });
                    return account?.user ?? null;
                },
                updateUser: (data) => db.user.update({ where: { id: data.id }, data: data as Prisma.UserUpdateInput }),
                deleteUser: (id) => db.user.delete({ where: { id } }),
                linkAccount: (data) => db.account.create({ data }) as any,
                unlinkAccount: (provider_providerAccountId) =>
                    db.account.delete({ where: { provider_providerAccountId } }) as any,
                async getSessionAndUser(sessionToken) {
                    const userAndSession = await db.session.findUnique({
                        where: { sessionToken },
                        include: { user: true },
                    });
                    if (!userAndSession) return null;
                    const { user, ...session } = userAndSession;
                    return { user, session };
                },
                createSession: (data) => db.session.create({ data }),
                updateSession: (data) =>
                    db.session.update({
                        data,
                        where: { sessionToken: data.sessionToken },
                    }),
                deleteSession: (sessionToken) =>
                    db.session.delete({ where: { sessionToken } }),
                createVerificationToken: (data) => db.verificationToken.create({ data }),
                async useVerificationToken(identifier_token) {
                    try {
                        return await db.verificationToken.delete({
                            where: { identifier_token },
                        });
                    } catch (error) {
                        // If token already used/deleted, just return null
                        // https://www.prisma.io/docs/reference/api-reference/error-reference#p2025
                        if (
                            (error as Prisma.PrismaClientKnownRequestError).code ===
                            'P2025'
                        )
                            return null;
                        throw error;
                    }
                },
            };
        }                
        `;

        const sf = project.createSourceFile(
            path.join(context.outDir, 'src/auth/next-auth-adapter.ts'),
            content,
            { overwrite: true }
        );

        sf.formatText();
    }

    generateAuthorize(project: Project, context: Context) {
        const content = `
        import { ZenStackService } from '..';
        import { hash, compare } from 'bcryptjs';
        
        async function hashPassword(password: string) {
            const hashedPassword = await hash(password, 12);
            return hashedPassword;
        }
        
        async function verifyPassword(password: string, hashedPassword: string) {
            const isValid = await compare(password, hashedPassword);
            return isValid;
        }
        
        export function authorize(service: ZenStackService) {
            return async (
                credentials: Record<'email' | 'password', string> | undefined
            ) => {
                if (!credentials) {
                    throw new Error('Missing credentials');
                }

                try {
                    let maybeUser = await service.db.user.findFirst({
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
                        if (!credentials.password || !credentials.email) {
                            throw new Error('Invalid Credentials');
                        }
        
                        maybeUser = await service.db.user.create({
                            data: {
                                email: credentials.email,
                                password: await hashPassword(credentials.password),
                            },
                            select: {
                                id: true,
                                email: true,
                                password: true,
                                name: true,
                            },
                        });
                    } else {
                        if (!maybeUser.password) {
                            throw new Error('Invalid User Record');
                        }

                        const isValid = await verifyPassword(
                            credentials.password,
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
        `;

        const sf = project.createSourceFile(
            path.join(context.outDir, 'src/auth/authorize.ts'),
            content,
            { overwrite: true }
        );

        sf.formatText();
    }
}
