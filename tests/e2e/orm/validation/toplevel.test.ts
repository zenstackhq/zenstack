import { createTestClient, loadSchemaWithError } from '@zenstackhq/testtools';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

describe('Toplevel field validation tests', () => {
    it('works with string fields', async () => {
        const db = await createTestClient(
            `
        model Foo {
            id    Int     @id @default(autoincrement())
            str1  String? @length(2, 4) @startsWith('a') @endsWith('b') @contains('m') @regex('b{2}')
            str2  String? @email
            str3  String? @datetime
            str4  String? @url
            str5  String? @trim @lower
            str6  String? @upper
            str7  String? @phone
            str8  String? @date
            str9  String? @time
            str10 String? @time(-1)
        }
        `,
        );

        await db.foo.create({ data: { id: 100 } });

        for (const action of ['create', 'update', 'upsert', 'updateMany']) {
            const _t =
                action === 'create'
                    ? (data: any) => db.foo.create({ data })
                    : action === 'update'
                      ? (data: any) => db.foo.update({ where: { id: 100 }, data })
                      : action === 'upsert'
                        ? (data: any) =>
                              db.foo.upsert({ where: { id: 100 }, create: { id: 101, ...data }, update: data })
                        : (data: any) => db.foo.updateMany({ where: { id: 100 }, data });

            // violates @length min
            await expect(_t({ str1: 'a' })).toBeRejectedByValidation();

            // violates @length max
            await expect(_t({ str1: 'abcde' })).toBeRejectedByValidation();

            // violates @startsWith
            await expect(_t({ str1: 'bcd' })).toBeRejectedByValidation();

            // violates @endsWith
            await expect(_t({ str1: 'abc' })).toBeRejectedByValidation();

            // violates @contains
            await expect(_t({ str1: 'abz' })).toBeRejectedByValidation();

            // violates @regex
            await expect(_t({ str1: 'amcb' })).toBeRejectedByValidation();

            // satisfies all
            await expect(_t({ str1: 'ambb' })).toResolveTruthy();

            // violates @email
            await expect(_t({ str2: 'not-an-email' })).toBeRejectedByValidation(['Invalid email']);

            // satisfies @email
            await expect(_t({ str2: 'test@example.com' })).toResolveTruthy();

            // violates @datetime
            await expect(_t({ str3: 'not-datetime' })).toBeRejectedByValidation();

            // satisfies @datetime
            await expect(_t({ str3: new Date().toISOString() })).toResolveTruthy();

            // violates @url
            await expect(_t({ str4: 'not-a-url' })).toBeRejectedByValidation();

            // satisfies @url
            await expect(_t({ str4: 'https://example.com' })).toResolveTruthy();

            // test @trim and @lower
            if (action !== 'updateMany') {
                await expect(_t({ str5: '  AbC  ' })).resolves.toMatchObject({ str5: 'abc' });
            } else {
                await expect(_t({ str5: '  AbC  ' })).resolves.toMatchObject({ count: 1 });
            }

            // test @upper
            if (action !== 'updateMany') {
                await expect(_t({ str6: 'aBc' })).resolves.toMatchObject({ str6: 'ABC' });
            } else {
                await expect(_t({ str6: 'aBc' })).resolves.toMatchObject({ count: 1 });
            }

            // violates @phone
            await expect(_t({ str7: 'not-a-phone' })).toBeRejectedByValidation(['Invalid E.164']);

            // satisfies @phone
            await expect(_t({ str7: '+15555555555' })).toResolveTruthy();

            // violates @date
            await expect(_t({ str8: 'not-a-date' })).toBeRejectedByValidation(['Invalid ISO date']);

            // satisfies @date
            await expect(_t({ str8: '2000-01-01' })).toResolveTruthy();

            // violates @time
            await expect(_t({ str9: 'not-a-time' })).toBeRejectedByValidation(['Invalid ISO time']);

            // satisfies @time
            await expect(_t({ str9: '03:15:00' })).toResolveTruthy();

            // violates @time(-1)
            await expect(_t({ str10: '03:15:00' })).toBeRejectedByValidation(['Invalid ISO time']);

            // satisfies @time(-1)
            await expect(_t({ str10: '03:15' })).toResolveTruthy();
        }
    });

    it('works with number fields', async () => {
        const db = await createTestClient(
            `
        model Foo {
            id Int @id @default(autoincrement())
            int1 Int? @gt(2) @lt(4)
            int2 Int? @gte(2) @lte(4)
        }
        `,
        );

        // violates @gt
        await expect(db.foo.create({ data: { int1: 1 } })).toBeRejectedByValidation();

        // violates @lt
        await expect(db.foo.create({ data: { int1: 4 } })).toBeRejectedByValidation();

        // violates @gte
        await expect(db.foo.create({ data: { int2: 1 } })).toBeRejectedByValidation();

        // violates @lte
        await expect(db.foo.create({ data: { int2: 5 } })).toBeRejectedByValidation();

        // satisfies all
        await expect(db.foo.create({ data: { int1: 3, int2: 4 } })).toResolveTruthy();
    });

    it('works with bigint fields', async () => {
        const db = await createTestClient(
            `
        model Foo {
            id Int @id @default(autoincrement())
            int1 BigInt? @gt(2) @lt(4)
            int2 BigInt? @gte(2) @lte(4)
        }
        `,
        );

        // violates @gt
        await expect(db.foo.create({ data: { int1: 1 } })).toBeRejectedByValidation();

        // violates @lt
        await expect(db.foo.create({ data: { int1: 4 } })).toBeRejectedByValidation();

        // violates @gte
        await expect(db.foo.create({ data: { int2: 1n } })).toBeRejectedByValidation();

        // violates @lte
        await expect(db.foo.create({ data: { int2: 5n } })).toBeRejectedByValidation();

        // satisfies all
        await expect(db.foo.create({ data: { int1: 3, int2: 4 } })).toResolveTruthy();
    });

    it('works with decimal fields', async () => {
        const db = await createTestClient(
            `
        model Foo {
            id Int @id @default(autoincrement())
            int1 Decimal? @gt(2) @lt(4)
            int2 Decimal? @gte(2) @lte(4)
        }
        `,
        );

        // violates @gt
        await expect(db.foo.create({ data: { int1: 1 } })).toBeRejectedByValidation();

        // violates @lt
        await expect(db.foo.create({ data: { int1: new Decimal(4) } })).toBeRejectedByValidation();

        // invalid decimal string
        await expect(db.foo.create({ data: { int2: 'f1.2' } })).toBeRejectedByValidation();

        // violates @gte
        await expect(db.foo.create({ data: { int2: '1.1' } })).toBeRejectedByValidation();

        // violates @lte
        await expect(db.foo.create({ data: { int2: '5.12345678' } })).toBeRejectedByValidation();

        // satisfies all
        await expect(db.foo.create({ data: { int1: '3.3', int2: new Decimal(3.9) } })).toResolveTruthy();
    });

    it('works with list fields', async () => {
        const db = await createTestClient(
            `
        model Foo {
            id Int @id @default(autoincrement())
            list1 Int[] @length(2, 4)
        }
        `,
            { provider: 'postgresql' },
        );

        await expect(db.foo.create({ data: { id: 1, list1: [1] } })).toBeRejectedByValidation();

        await expect(db.foo.create({ data: { id: 1, list1: [1, 2, 3, 4, 5] } })).toBeRejectedByValidation();

        await expect(db.foo.create({ data: { id: 1, list1: [1, 2, 3] } })).toResolveTruthy();

        await expect(db.foo.update({ where: { id: 1 }, data: { list1: [1] } })).toBeRejectedByValidation();
        await expect(db.foo.update({ where: { id: 1 }, data: { list1: [1, 2, 3, 4, 5] } })).toBeRejectedByValidation();
        await expect(db.foo.update({ where: { id: 1 }, data: { list1: [2, 3, 4] } })).toResolveTruthy();
    });

    it('rejects accessing relation fields', async () => {
        await loadSchemaWithError(
            `
        model Foo {
            id Int @id @default(autoincrement())
            bars Bar[]
            @@validate(bars != null)
        }

        model Bar {
            id Int @id @default(autoincrement())
            foo Foo @relation(fields: [fooId], references: [id])
            fooId Int
        }
            `,
            'cannot use relation fields',
        );

        await loadSchemaWithError(
            `
        model Foo {
            id Int @id @default(autoincrement())
            bars Bar[]
            @@validate(bars.fooId > 0)
        }

        model Bar {
            id Int @id @default(autoincrement())
            foo Foo @relation(fields: [fooId], references: [id])
            fooId Int
        }
            `,
            'cannot use relation fields',
        );
    });
});
