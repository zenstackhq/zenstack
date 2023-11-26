import { Prisma } from 'prisma-client-internal';
import { enhance } from '@zenstackhq/runtime';
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
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-getAll',
                model: {
                    $allModels: {
                        async getAll<T, A>(this: T, args?: Prisma.Exact<A, Prisma.Args<T, 'findMany'>>) {
                            const context = Prisma.getExtensionContext(this);
                            const r = await (context as any).findMany(args);
                            console.log('getAll result:', r);
                            return r as Prisma.Result<T, A, 'findMany'>;
                        },
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        await expect(db.model.getAll()).resolves.toHaveLength(2);

        // FIXME: extending an enhanced client doesn't work for this case
        // const db1 = enhance(prisma).$extends(ext);
        // await expect(db1.model.getAll()).resolves.toHaveLength(2);
    });

    it('one model new method', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-getAll',
                model: {
                    model: {
                        async getAll<T, A>(this: T, args?: Prisma.Exact<A, Prisma.Args<T, 'findMany'>>) {
                            const context = Prisma.getExtensionContext(this);
                            const r = await (context as any).findMany(args);
                            return r as Prisma.Result<T, A, 'findMany'>;
                        },
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        await expect(db.model.getAll()).resolves.toHaveLength(2);
    });

    it('add client method', async () => {
        const { prisma } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
            value Int
        
            @@allow('read', value > 0)
        }
        `
        );

        let logged = false;

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-log',
                client: {
                    $log: (s: string) => {
                        console.log(s);
                        logged = true;
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        xprisma.$log('abc');
        expect(logged).toBeTruthy();
    });

    it('query override one model', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    model: {
                        async findMany({ args, query }: any) {
                            // take incoming `where` and set `age`
                            args.where = { ...args.where, y: { lt: 300 } };
                            return query(args);
                        },
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        await expect(db.model.findMany()).resolves.toHaveLength(1);
    });

    it('query override all models', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    $allModels: {
                        async findMany({ args, query }: any) {
                            // take incoming `where` and set `age`
                            args.where = { ...args.where, y: { lt: 300 } };
                            console.log('findMany args:', args);
                            return query(args);
                        },
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        await expect(db.model.findMany()).resolves.toHaveLength(1);
    });

    it('query override all operations', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    model: {
                        async $allOperations({ operation, args, query }: any) {
                            // take incoming `where` and set `age`
                            args.where = { ...args.where, y: { lt: 300 } };
                            console.log(`${operation} args:`, args);
                            return query(args);
                        },
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        await expect(db.model.findMany()).resolves.toHaveLength(1);
    });

    it('query override everything', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-queryOverride',
                query: {
                    async $allOperations({ operation, args, query }: any) {
                        // take incoming `where` and set `age`
                        args.where = { ...args.where, y: { lt: 300 } };
                        console.log(`${operation} args:`, args);
                        return query(args);
                    },
                },
            });
        });

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        await expect(db.model.findMany()).resolves.toHaveLength(1);
    });

    it('result mutation', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
                name: 'prisma-extension-resultMutation',
                query: {
                    model: {
                        async findMany({ args, query }) {
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

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        const r = await db.model.findMany();
        expect(r).toHaveLength(1);
        expect(r).toEqual(expect.arrayContaining([expect.objectContaining({ value: 2 })]));
    });

    it('result custom fields', async () => {
        const { prisma } = await loadSchema(
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

        const ext = Prisma.defineExtension((prisma) => {
            return prisma.$extends({
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

        const xprisma = prisma.$extends(ext);
        const db = enhance(xprisma);
        const r = await db.model.findMany();
        expect(r).toHaveLength(1);
        expect(r).toEqual(expect.arrayContaining([expect.objectContaining({ doubleValue: 2 })]));
    });
});
