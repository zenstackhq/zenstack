import { loadSchema } from '@zenstackhq/testtools';

describe('Proxy Extension Context', () => {
    it('works', async () => {
        const { enhance } = await loadSchema(
            `
            model Counter {
                model String @unique
                value Int
                
                @@allow('all', true)
            }
            
            model Address {
                id   String @id @default(cuid())
                city String
                
                @@allow('all', true)
            }
            `
        );

        const db = enhance();
        const dbExtended = db.$extends({
            client: {
                $one() {
                    return 1;
                }
            },
            model: {
                $allModels: {
                    async createWithCounter(this: any, args: any) {
                        const modelName = this.$name;
                        const dbOrTx = this.$parent;

                        // prisma exposes some internal properties, makes sure these are still preserved
                        expect(dbOrTx._engine).toBeDefined();

                        const fn = async (tx: any) => {
                            const counter = await tx.counter.findUnique({
                                where: { model: modelName },
                            });

                            await tx.counter.upsert({
                                where: { model: modelName },
                                update: { value: (counter?.value ?? 0) + tx.$one() },
                                create: { model: modelName, value: tx.$one() },
                            });

                            return tx[modelName].create(args);
                        };

                        if (dbOrTx['$transaction']) {
                            // not running in a transaction, so we need to create a new transaction
                            return dbOrTx.$transaction(fn);
                        }

                        return fn(dbOrTx);
                    },
                },
            },
        });

        const cities = ['Vienna', 'New York', 'Delhi'];

        await Promise.all([
            ...cities.map((city) => dbExtended.address.createWithCounter({ data: { city } })),
            ...cities.map((city) =>
                dbExtended.$transaction((tx: any) => tx.address.createWithCounter({ data: { city: `${city}$tx` } }))
            ),
        ]);

        await expect(dbExtended.counter.findUniqueOrThrow({ where: { model: 'Address' } })).resolves.toMatchObject({
            model: 'Address',
            value: cities.length * 2,
        });
    });
});
