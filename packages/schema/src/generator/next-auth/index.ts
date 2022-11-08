import { Context, Generator } from '../types';
import { Project } from 'ts-morph';
import * as path from 'path';
import colors from 'colors';
import { DataModel, isDataModel, Model } from '@lang/generated/ast';
import { execSync } from 'child_process';

/**
 * Generates NextAuth adaptor code
 */
export default class NextAuthGenerator implements Generator {
    get name() {
        return 'next-auth';
    }

    private findModel(schema: Model, name: string) {
        return schema.declarations.find(
            (d) => isDataModel(d) && d.name === name
        ) as DataModel;
    }

    private modelHasField(model: DataModel, name: string) {
        return !!model.fields.find((f) => f.name === name);
    }

    async generate(context: Context): Promise<void> {
        try {
            execSync('npm ls next-auth');
        } catch (err) {
            console.warn(
                colors.yellow(
                    'Next-auth module is not installed, skipping generating adapter.'
                )
            );
            return;
        }

        if (!this.findModel(context.schema, 'User')) {
            console.warn(
                colors.yellow(
                    'Skipping generating next-auth adapter: "User" model not found.'
                )
            );
            return;
        }

        const userModel = this.findModel(context.schema, 'User');
        if (
            !this.modelHasField(userModel, 'email') ||
            !this.modelHasField(userModel, 'emailVerified')
        ) {
            console.warn(
                colors.yellow(
                    `Skipping generating next-auth adapter because "User" model doesn't meet requirements: "email" and "emailVerified" fields are required.`
                )
            );
            return;
        }

        const project = new Project();

        this.generateIndex(project, context);
        this.generateAdapter(project, context);
        this.generateAuthorize(project, context);

        await project.save();

        console.log(colors.blue(`  ✔️ Next-auth adapter generated`));
    }

    private generateIndex(project: Project, context: Context) {
        const sf = project.createSourceFile(
            path.join(context.generatedCodeDir, 'src/auth/index.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addStatements([
            `export * from './next-auth-adapter';`,
            `export * from './authorize';`,
        ]);

        sf.formatText();
    }

    private generateAdapter(project: Project, context: Context) {
        const sf = project.createSourceFile(
            path.join(
                context.generatedCodeDir,
                'src/auth/next-auth-adapter.ts'
            ),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclarations([
            {
                namedImports: [
                    {
                        name: 'ZenStackService',
                    },
                ],
                moduleSpecifier: '..',
            },
            {
                namedImports: [
                    {
                        name: 'Adapter',
                    },
                ],
                moduleSpecifier: 'next-auth/adapters',
            },
            {
                namedImports: [
                    {
                        name: 'Prisma',
                    },
                ],
                moduleSpecifier: '../../.prisma',
                isTypeOnly: true,
            },
        ]);

        const adapter = sf.addFunction({
            name: 'NextAuthAdapter',
            isExported: true,
            returnType: 'Adapter',
        });

        adapter.addParameter({
            name: 'service',
            type: 'ZenStackService',
        });

        const userModel = this.findModel(context.schema, 'User');

        adapter.setBodyText((writer) => {
            writer.writeLine('const db = service.db;');
            writer.write('return ');
            writer.block(() => {
                writer.writeLine(
                    `
                    createUser: (data) => db.user.create({ data: data as Prisma.UserCreateInput }),
                    getUser: (id) => db.user.findUnique({ where: { id } }),
                    updateUser: (data) => db.user.update({ where: { id: data.id }, data: data as Prisma.UserUpdateInput }),
                    deleteUser: (id) => db.user.delete({ where: { id } }),
                    `
                );

                if (this.modelHasField(userModel, 'email')) {
                    writer.writeLine(
                        'getUserByEmail: (id) => db.user.findUnique({ where: { id } }),'
                    );
                } else {
                    writer.writeLine(
                        `getUserByEmail: (id) => { throw new Error('"User" model has no "email" field'); },`
                    );
                }

                if (this.findModel(context.schema, 'Account')) {
                    writer.writeLine(
                        `
                        async getUserByAccount(provider_providerAccountId) {
                            const account = await db.account.findUnique({
                                where: { provider_providerAccountId },
                                select: { user: true },
                            });
                            return account?.user ?? null;
                        },
                        linkAccount: (data) => db.account.create({ data }) as any,
                        unlinkAccount: (provider_providerAccountId) =>
                            db.account.delete({ where: { provider_providerAccountId } }) as any,
                        `
                    );
                } else {
                    writer.writeLine(
                        `
                        async getUserByAccount(provider_providerAccountId) { throw new Error('Schema has no "Account" model declared'); },
                        linkAccount: (data) => { throw new Error('Schema has no "Account" model declared'); },
                        unlinkAccount: (provider_providerAccountId) => { throw new Error('Schema has no "Account" model declared'); },
                        `
                    );
                }

                if (this.findModel(context.schema, 'Session')) {
                    writer.writeLine(
                        `
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
                        `
                    );
                } else {
                    writer.writeLine(
                        `
                        async getSessionAndUser(sessionToken) { throw new Error('Schema has no "Session" model declared'); },
                        createSession: (data) => { throw new Error('Schema has no "Session" model declared'); },
                        updateSession: (data) => { throw new Error('Schema has no "Session" model declared'); },
                        deleteSession: (sessionToken) => { throw new Error('Schema has no "Session" model declared'); },                        `
                    );
                }

                if (this.findModel(context.schema, 'VerificationToken')) {
                    writer.writeLine(
                        `
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
                        `
                    );
                } else {
                    writer.writeLine(
                        `
                        createVerificationToken: (data) => { throw new Error('Schema has no "VerificationToken" model declared'); },
                        async useVerificationToken(identifier_token) { throw new Error('Schema has no "VerificationToken" model declared'); },                       `
                    );
                }
            });
        });

        sf.formatText();
    }

    private generateAuthorize(project: Project, context: Context) {
        const userModel = this.findModel(context.schema, 'User');
        const hasEmail = userModel && this.modelHasField(userModel, 'email');
        const hasPassword =
            userModel && this.modelHasField(userModel, 'password');

        let content = '';
        if (!hasEmail || !hasPassword) {
            content = `
            import { ZenStackService } from '..';

            export function authorize(service: ZenStackService, implicitSignup = false) {
                throw new Error('"User" model must have "email" and "password" field');
            }
            `;
        } else {
            content = `
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
            
            export function authorize(service: ZenStackService, implicitSignup = false) {
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
                            if (!implicitSignup || !credentials.password || !credentials.email) {
                                return null;
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
                                return null;
                            }
                        }
            
                        return {
                            id: maybeUser.id,
                            email: maybeUser.email,
                            name: maybeUser.name,
                        };
                    } catch (error) {
                        console.log('Error occurred during authorization:', error);
                        throw error;
                    }
                };
            }
        `;
        }

        const sf = project.createSourceFile(
            path.join(context.generatedCodeDir, 'src/auth/authorize.ts'),
            content,
            { overwrite: true }
        );

        sf.formatText();
    }
}
