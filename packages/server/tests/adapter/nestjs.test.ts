import { Test } from '@nestjs/testing';
import { loadSchema } from '@zenstackhq/testtools';
import { ZenStackModule, ENHANCED_PRISMA, ApiHandlerService } from '../../src/nestjs';
import { HttpAdapterHost, REQUEST } from '@nestjs/core';
import RESTApiHandler from '../../src/api/rest';

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

describe('NestJS adapter tests', () => {
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

describe('ApiHandlerService tests', () => {
    it('with default option', async () => {
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
                    provide: REQUEST,
                    useValue: {}
                },
                {
                    provide: HttpAdapterHost,
                    useValue: {
                        httpAdapter: {
                            getRequestHostname: jest.fn().mockReturnValue('localhost'),
                            getRequestUrl: jest.fn().mockReturnValue('/post/findMany'),
                            getRequestMethod: jest.fn().mockReturnValue('GET'),
                        }
                    }
                },
                ApiHandlerService,
            ],
        }).compile();

        const service = await moduleRef.resolve<ApiHandlerService>(ApiHandlerService);
        expect(await service.handleRequest()).toEqual({
            data: [{
                id: 1,
                title: 'post1',
                published: true,
                authorId: 1,
            }]
        })
    })

    it('with rest api handler', async () => {
        const { prisma, enhanceRaw, modelMeta, zodSchemas } = await loadSchema(schema);

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
                    provide: REQUEST,
                    useValue: {}
                },
                {
                    provide: HttpAdapterHost,
                    useValue: {
                        httpAdapter: {
                            getRequestHostname: jest.fn().mockReturnValue('localhost'),
                            getRequestUrl: jest.fn().mockReturnValue('/post'),
                            getRequestMethod: jest.fn().mockReturnValue('GET'),
                        }
                    }
                },
                ApiHandlerService,
            ],
        }).compile();

        const service = await moduleRef.resolve<ApiHandlerService>(ApiHandlerService);
        expect(await service.handleRequest({
            handler: RESTApiHandler({
                endpoint: 'http://localhost',
            }),
            modelMeta,
            zodSchemas,
        })).toEqual({
            jsonapi: {
                version: "1.1"
            },
            data: [{
                type: 'post',
                id: 1,
                attributes: {
                    title: 'post1',
                    published: true,
                    authorId: 1,
                },
                links: {
                    self: 'http://localhost/post/1',
                },
                relationships: {
                    author: {
                        data: {
                            id: 1,
                            type: 'user',
                        },
                        links: {
                            related: 'http://localhost/post/1/author',
                            self: 'http://localhost/post/1/relationships/author',
                        }
                    }
                }
            }],
            links: {
                first: "http://localhost/post?page%5Blimit%5D=100",
                last: "http://localhost/post?page%5Boffset%5D=0",
                next: null,
                prev: null,
                self: "http://localhost/post"
            },
            meta: {
                total: 1
            }
        })
    })

    it('option baseUrl', async () => {
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
                    provide: REQUEST,
                    useValue: {}
                },
                {
                    provide: HttpAdapterHost,
                    useValue: {
                        httpAdapter: {
                            getRequestHostname: jest.fn().mockReturnValue('localhost'),
                            getRequestUrl: jest.fn().mockReturnValue('/api/rpc/post/findMany'),
                            getRequestMethod: jest.fn().mockReturnValue('GET'),
                        }
                    }
                },
                ApiHandlerService,
            ],
        }).compile();

        const service = await moduleRef.resolve<ApiHandlerService>(ApiHandlerService);
        expect(await service.handleRequest({
            baseUrl: '/api/rpc'
        })).toEqual({
            data: [{
                id: 1,
                title: 'post1',
                published: true,
                authorId: 1,
            }]
        })
    })
})
