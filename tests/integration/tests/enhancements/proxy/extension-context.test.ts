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
            model: {
                $allModels: {
                    async createWithCounter(this: any, args: any) {
                        const modelName = this.$name;
                        const dbOrTx = this.$zenstack_parent;

                        const fn = async (tx: any) => {
                            const counter = await tx.counter.findUnique({
                                where: { model: modelName },
                            });

                            await tx.counter.upsert({
                                where: { model: modelName },
                                update: { value: (counter?.value ?? 0) + 1 },
                                create: { model: modelName, value: 1 },
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

        // expecting object
        await expect(dbExtended.counter.findUniqueOrThrow({ where: { model: 'Address' } })).resolves.toMatchObject({
            model: 'Address',
            value: cities.length * 2,
        });
    });
});
