import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: client extensions', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('all model new method', async () => {
        const { prisma, enhanceRaw, prismaModule } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 0)
        }
        `
        );

        await prisma.model.create({ data: { value: 0 } });
        await prisma.model.create({ data: { value: 1 } });
        await prisma.model.create({ data: { value: 2 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-getAll',
                model: {
                    $allModels: {
                        async getAll<T, A>(this: T, args?: any) {
                            const context = prismaModule.getExtensionContext(this);
                            const r = await (context as any).findMany(args);
                            console.log('getAll result:', r);
                            return r;
                        },
                    },
                },
            });
        });

        await expect(prisma.$extends(ext).model.getAll()).resolves.toHaveLength(3);
        await expect(enhanceRaw(prisma.$extends(ext)).model.getAll()).resolves.toHaveLength(2);
        await expect(enhanceRaw(prisma).$extends(ext).model.getAll()).resolves.toHaveLength(2);
    });

    it('one model new method', async () => {
        const { prisma, enhanceRaw, prismaModule } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 0)
        }
        `
        );

        await prisma.model.create({ data: { value: 0 } });
        await prisma.model.create({ data: { value: 1 } });
        await prisma.model.create({ data: { value: 2 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-getAll',
                model: {
                    model: {
                        async getAll<T, A>(this: T, args?: any) {
                            const context = prismaModule.getExtensionContext(this);
                            const r = await (context as any).findMany(args);
                            return r;
                        },
                    },
                },
            });
        });

        await expect(prisma.$extends(ext).model.getAll()).resolves.toHaveLength(3);
        await expect(enhanceRaw(prisma.$extends(ext)).model.getAll()).resolves.toHaveLength(2);
        await expect(enhanceRaw(prisma).$extends(ext).model.getAll()).resolves.toHaveLength(2);
    });

    it('add client method', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 0)
        }
        `
        );

        let logged = false;

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-log',
                client: {
                    $log: (s: string) => {
                        console.log(s);
                        logged = true;
                    },
                },
            });
        });

        enhanceRaw(prisma).$extends(ext).$log('abc');
        expect(logged).toBeTruthy();

        logged = false;
        enhanceRaw(prisma.$extends(ext)).$log('abc');
        expect(logged).toBeTruthy();
    });

    it('query override one model', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int
            y Int
        
            @@allow('read', x > 0)
        }
        `
        );

        await prisma.model.create({ data: { x: 0, y: 100 } });
        await prisma.model.create({ data: { x: 1, y: 200 } });
        await prisma.model.create({ data: { x: 2, y: 300 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    model: {
                        async findMany({ args, query }: any) {
                            args.where = { ...args.where, y: { lt: 300 } };
                            return query(args);
                        },
                    },
                },
            });
        });

        await expect(enhanceRaw(prisma.$extends(ext)).model.findMany()).resolves.toHaveLength(1);
        await expect(enhanceRaw(prisma).$extends(ext).model.findMany()).resolves.toHaveLength(1);
    });

    it('query override all models', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int
            y Int
        
            @@allow('read', x > 0)
        }
        `
        );

        await prisma.model.create({ data: { x: 0, y: 100 } });
        await prisma.model.create({ data: { x: 1, y: 200 } });
        await prisma.model.create({ data: { x: 2, y: 300 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    $allModels: {
                        async findMany({ args, query }: any) {
                            args.where = { ...args.where, y: { lt: 300 } };
                            console.log('findMany args:', args);
                            return query(args);
                        },
                    },
                },
            });
        });

        await expect(enhanceRaw(prisma.$extends(ext)).model.findMany()).resolves.toHaveLength(1);
        await expect(enhanceRaw(prisma).$extends(ext).model.findMany()).resolves.toHaveLength(1);
    });

    it('query override all operations', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int
            y Int
        
            @@allow('read', x > 0)
        }
        `
        );

        await prisma.model.create({ data: { x: 0, y: 100 } });
        await prisma.model.create({ data: { x: 1, y: 200 } });
        await prisma.model.create({ data: { x: 2, y: 300 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    model: {
                        async $allOperations({ operation, args, query }: any) {
                            args.where = { ...args.where, y: { lt: 300 } };
                            console.log(`${operation} args:`, args);
                            return query(args);
                        },
                    },
                },
            });
        });

        await expect(enhanceRaw(prisma.$extends(ext)).model.findMany()).resolves.toHaveLength(1);
        await expect(enhanceRaw(prisma).$extends(ext).model.findMany()).resolves.toHaveLength(1);
    });

    it('query override everything', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            x Int
            y Int
        
            @@allow('read', x > 0)
        }
        `
        );

        await prisma.model.create({ data: { x: 0, y: 100 } });
        await prisma.model.create({ data: { x: 1, y: 200 } });
        await prisma.model.create({ data: { x: 2, y: 300 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    async $allOperations({ operation, args, query }: any) {
                        args.where = { ...args.where, y: { lt: 300 } };
                        console.log(`${operation} args:`, args);
                        return query(args);
                    },
                },
            });
        });

        await expect(enhanceRaw(prisma.$extends(ext)).model.findMany()).resolves.toHaveLength(1);
        await expect(enhanceRaw(prisma).$extends(ext).model.findMany()).resolves.toHaveLength(1);
    });

    it('result mutation', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 0)
        }
        `
        );

        await prisma.model.create({ data: { value: 0 } });
        await prisma.model.create({ data: { value: 1 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-resultMutation',
                query: {
                    model: {
                        async findMany({ args, query }: any) {
                            const r: any = await query(args);
                            for (let i = 0; i < r.length; i++) {
                                r[i].value = r[i].value + 1;
                            }
                            return r;
                        },
                    },
                },
            });
        });

        const expected = [expect.objectContaining({ value: 2 })];
        await expect(enhanceRaw(prisma.$extends(ext)).model.findMany()).resolves.toEqual(expected);
        await expect(enhanceRaw(prisma).$extends(ext).model.findMany()).resolves.toEqual(expected);
    });

    it('result custom fields', async () => {
        const { prisma, prismaModule, enhanceRaw } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 0)
        }
        `
        );

        await prisma.model.create({ data: { value: 0 } });
        await prisma.model.create({ data: { value: 1 } });

        const ext = prismaModule.defineExtension((_prisma: any) => {
            return _prisma.$extends({
                name: 'prisma-extension-resultNewFields',
                result: {
                    model: {
                        doubleValue: {
                            needs: { value: true },
                            compute(m: any) {
                                return m.value * 2;
                            },
                        },
                    },
                },
            });
        });

        const expected = [expect.objectContaining({ doubleValue: 2 })];
        await expect(enhanceRaw(prisma.$extends(ext)).model.findMany()).resolves.toEqual(expected);
        await expect(enhanceRaw(prisma).$extends(ext).model.findMany()).resolves.toEqual(expected);
    });
});
