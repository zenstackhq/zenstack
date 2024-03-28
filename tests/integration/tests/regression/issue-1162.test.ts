import { loadSchema } from '@zenstackhq/testtools';
import { enhance } from '@zenstackhq/runtime';

describe('issue 1173', () => {
    it('regression', async () => {
        const { Prisma, prisma } = await loadSchema(
            `
            model Test {
                id Int @id @default(autoincrement())
                currency String
              
                @@validate(currency in [
                    'ZZEUR',
                    'ZZUSD'
                  ],
                  'type must be one of the following values: ZZEUR, ZZUSD'
                )
                @@allow("all", true)
              }
            `,
            { logPrismaQuery: true }
        );

        const preTransformations = {
            args: {
                currencyTransform: (data: any) => {
                    const currencyFields = ['currency'];

                    currencyFields.forEach((field) => {
                        if (data && data[field]) {
                            data[field] = 'ZZ' + data[field];
                        }
                    });

                    return data;
                },
            },
        };

        const postTransformations = {
            result: {
                currencyTransform: (result: any) => {
                    if (!result) {
                        return result;
                    }

                    const currencyFields = ['currency'];

                    currencyFields.forEach((field) => {
                        if (Array.isArray(result)) {
                            result = result.map((result) => {
                                if (result[field]) {
                                    result[field] = result[field].replace('ZZ', '');
                                }
                                return result;
                            });
                        }

                        if (result[field]) {
                            result[field] = result[field].replace('ZZ', '');
                        }
                    });

                    return result;
                },
            },
        };

        const CurrencyTransformationExtensionTest = Prisma.defineExtension({
            name: 'Currency Transformation',

            query: {
                $allModels: {
                    async $allOperations({ operation, args, query }: any) {
                        const valueFields = ['data', 'create', 'update', 'where'];

                        switch (operation) {
                            // For all select operations
                            case 'aggregate':
                            case 'count':
                            case 'findFirst':
                            case 'findFirstOrThrow':
                            case 'findMany':
                            case 'findUnique':
                            case 'groupBy':
                            case 'upsert':
                            case 'update':
                            case 'updateMany':
                            case 'findUniqueOrThrow':
                            // For all mutation operations
                            case 'create':
                            case 'createMany':
                            case 'update':
                            case 'updateMany':
                            case 'upsert': {
                                valueFields.forEach((field) => {
                                    if (args[field]) {
                                        args[field] = preTransformations.args.currencyTransform(args[field]);
                                    }
                                });
                            }
                        }

                        return postTransformations.result.currencyTransform(await query(args));
                    },
                },
            },
        });

        // const extendedPrisma = prisma.$extends(CurrencyTransformationExtensionTest);
        // const extendedAndEnhancedPrisma = enhance(extendedPrisma);

        const extendedAndEnhancedPrisma = enhance(prisma).$extends(CurrencyTransformationExtensionTest);

        // const testEntity = await extendedPrisma.test.create({
        //     data: {
        //         currency: 'USD',
        //     },
        // });
        // console.log(testEntity);
        // console.log(await prisma.test.findUnique({ where: { id: testEntity.id } }));

        const enhancedTestEntity = await extendedAndEnhancedPrisma.test.create({
            data: {
                currency: 'USD',
            },
        });
        console.log(enhancedTestEntity);
        console.log(await prisma.test.findUnique({ where: { id: enhancedTestEntity.id } }));
    });
});
