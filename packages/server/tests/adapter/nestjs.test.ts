import { Test } from '@nestjs/testing';
import { loadSchema } from '@zenstackhq/testtools';
import { ZenStackModule } from '../../src/nestjs';
import { ENHANCED_PRISMA } from '../../src/nestjs/zenstack.module';

describe('NestJS adapter tests', () => {
    const schema = `
    model User {
        id Int @id @default(autoincrement())
        posts Post[]
        @@allow('all', true)
    }

    model Post {
        id Int @id @default(autoincrement())
        title String
        published Boolean @default(false)
        author User @relation(fields: [authorId], references: [id])
        authorId Int

        @@allow('read', published || auth() == author)
    }
    `;

    it('anonymous', async () => {
        const { prisma, enhanceRaw } = await loadSchema(schema);

        await prisma.user.create({
            data: {
                posts: {
                    create: [
                        { title: 'post1', published: true },
                        { title: 'post2', published: false },
                    ],
                },
            },
        });

        const moduleRef = await Test.createTestingModule({
            imports: [
                ZenStackModule.registerAsync({
                    useFactory: (prismaService) => ({ getEnhancedPrisma: () => enhanceRaw(prismaService) }),
                    inject: ['PrismaService'],
                    extraProviders: [
                        {
                            provide: 'PrismaService',
                            useValue: prisma,
                        },
                    ],
                }),
            ],
            providers: [
                {
                    provide: 'PostService',
                    useFactory: (enhancedPrismaService) => ({
                        findAll: () => enhancedPrismaService.post.findMany(),
                    }),
                    inject: [ENHANCED_PRISMA],
                },
            ],
        }).compile();

        const app = moduleRef.createNestApplication();
        await app.init();

        const postSvc = app.get('PostService');
        await expect(postSvc.findAll()).resolves.toHaveLength(1);
    });

    it('auth user', async () => {
        const { prisma, enhanceRaw } = await loadSchema(schema);

        await prisma.user.create({
            data: {
                id: 1,
                posts: {
                    create: [
                        { title: 'post1', published: true },
                        { title: 'post2', published: false },
                    ],
                },
            },
        });

        const moduleRef = await Test.createTestingModule({
            imports: [
                ZenStackModule.registerAsync({
                    useFactory: (prismaService) => ({
                        getEnhancedPrisma: () => enhanceRaw(prismaService, { user: { id: 1 } }),
                    }),
                    inject: ['PrismaService'],
                    extraProviders: [
                        {
                            provide: 'PrismaService',
                            useValue: prisma,
                        },
                    ],
                }),
            ],
            providers: [
                {
                    provide: 'PostService',
                    useFactory: (enhancedPrismaService) => ({
                        findAll: () => enhancedPrismaService.post.findMany(),
                    }),
                    inject: [ENHANCED_PRISMA],
                },
            ],
        }).compile();

        const app = moduleRef.createNestApplication();
        await app.init();

        const postSvc = app.get('PostService');
        await expect(postSvc.findAll()).resolves.toHaveLength(2);
    });

    it('custom token', async () => {
        const { prisma, enhanceRaw } = await loadSchema(schema);

        await prisma.user.create({
            data: {
                posts: {
                    create: [
                        { title: 'post1', published: true },
                        { title: 'post2', published: false },
                    ],
                },
            },
        });

        const moduleRef = await Test.createTestingModule({
            imports: [
                ZenStackModule.registerAsync({
                    useFactory: (prismaService) => ({ getEnhancedPrisma: () => enhanceRaw(prismaService) }),
                    inject: ['PrismaService'],
                    extraProviders: [
                        {
                            provide: 'PrismaService',
                            useValue: prisma,
                        },
                    ],
                    exportToken: 'MyEnhancedPrisma',
                }),
            ],
            providers: [
                {
                    provide: 'PostService',
                    useFactory: (enhancedPrismaService) => ({
                        findAll: () => enhancedPrismaService.post.findMany(),
                    }),
                    inject: ['MyEnhancedPrisma'],
                },
            ],
        }).compile();

        const app = moduleRef.createNestApplication();
        await app.init();

        const postSvc = app.get('PostService');
        await expect(postSvc.findAll()).resolves.toHaveLength(1);
    });

    it('pass property', async () => {
        const { prisma, enhanceRaw } = await loadSchema(schema);

        await prisma.user.create({
            data: {
                posts: {
                    create: [
                        { title: 'post1', published: true },
                        { title: 'post2', published: false },
                    ],
                },
            },
        });

        const moduleRef = await Test.createTestingModule({
            imports: [
                ZenStackModule.registerAsync({
                    useFactory: (prismaService) => ({
                        getEnhancedPrisma: (prop) => {
                            return prop === 'post' ? prismaService : enhanceRaw(prismaService, { user: { id: 2 } });
                        },
                    }),
                    inject: ['PrismaService'],
                    extraProviders: [
                        {
                            provide: 'PrismaService',
                            useValue: prisma,
                        },
                    ],
                }),
            ],
            providers: [
                {
                    provide: 'PostService',
                    useFactory: (enhancedPrismaService) => ({
                        findAll: () => enhancedPrismaService.post.findMany(),
                    }),
                    inject: [ENHANCED_PRISMA],
                },
            ],
        }).compile();

        const app = moduleRef.createNestApplication();
        await app.init();

        const postSvc = app.get('PostService');
        await expect(postSvc.findAll()).resolves.toHaveLength(2);
    });
});
