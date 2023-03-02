import { AuthUser } from '@zenstackhq/runtime';
import { loadSchema, run, WeakDbClientContract } from '@zenstackhq/testtools';

describe('Prisma Methods Tests', () => {
    let getDb: (user?: AuthUser) => WeakDbClientContract;
    let prisma: WeakDbClientContract;

    beforeAll(async () => {
        const { withPresets, prisma: _prisma } = await loadSchema(
            `
            model Model {
                id String @id @default(cuid())
                value Int

                @@allow('all', value > 0)
            }
            `
        );
        getDb = withPresets;
        prisma = _prisma;
    });

    beforeEach(() => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    it('transaction', async () => {
        const db = getDb({ id: 'user1' });

        const r = await db.$transaction(async (tx) => {
            const r1 = await tx.model.create({ data: { id: '1', value: 1 } });
            const r2 = await tx.model.create({ data: { id: '2', value: 2 } });
            return [r1, r2];
        });

        expect(r).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' })])
        );

        await expect(
            db.$transaction(async (tx) => {
                const r3 = await tx.model.create({ data: { id: '3', value: 3 } });
                const r4 = await tx.model.create({ data: { id: '4', value: -1 } });
                return [r3, r4];
            })
        ).rejects.toThrow();

        const r3 = await db.model.findUnique({ where: { id: '3' } });
        expect(r3).toBeNull();
        const r4 = await db.model.findUnique({ where: { id: '4' } });
        expect(r4).toBeNull();
    });

    it('raw sql', async () => {
        const db = getDb();

        const r = await db.$transaction(async (tx) => {
            const r1 = await tx.model.create({ data: { id: '1', value: 1 } });
            const r2 = await tx.model.create({ data: { id: '2', value: 2 } });
            return [r1, r2];
        });

        const q = await db.$queryRaw`SELECT * FROM "Model" WHERE id=${r[1].id};`;
        expect(q[0]).toEqual(expect.objectContaining(r[1]));

        const r1 = await db.$executeRaw`UPDATE "Model" SET value=5 WHERE id="1";`;
        expect(r1).toBe(1);
        await expect(db.model.findUnique({ where: { id: '1' } })).resolves.toEqual(
            expect.objectContaining({ value: 5 })
        );
    });

    it('middleware', async () => {
        const db = getDb();
        let middlewareCalled = false;
        db.$use(async (params: any, next: Function) => {
            middlewareCalled = true;
            return next(params);
        });

        await db.model.create({ data: { id: '1', value: 1 } });
        expect(middlewareCalled).toBeTruthy();
    });

    it('extension', async () => {
        const db = getDb();

        const extendedDb: any = db.$extends({
            client: {
                $hello: (name: string) => `Hello ${name}`,
            },
            query: {
                model: {
                    findMany({ query, args }: { query: Function; args: any }) {
                        args.where = { value: { gt: 1 }, ...args.where };
                        return query(args);
                    },
                },
            },
            model: {
                model: {
                    greet: (name: string) => `Greeting from ${name}`,
                },
            },
            result: {
                model: {
                    valuePlus: {
                        needs: { value: true },
                        compute(model: any) {
                            return model.value + 1;
                        },
                    },
                },
            },
        });

        expect(extendedDb.$hello('world')).toBe('Hello world');

        await db.model.create({ data: { id: '1', value: 1 } });
        await db.model.create({ data: { id: '2', value: 2 } });
        await expect(db.model.findMany()).resolves.toHaveLength(2);

        const r = await extendedDb.model.findMany();
        expect(r).toHaveLength(1);
        expect(r[0].value).toBe(2);
        expect(r[0].valuePlus).toBe(3);

        expect(extendedDb.model.greet('ymc9')).toBe('Greeting from ymc9');
    });
});
