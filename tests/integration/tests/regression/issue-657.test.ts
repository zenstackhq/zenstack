import { loadSchema } from '@zenstackhq/testtools';
import Decimal from 'decimal.js';

describe('Regression: issue 657', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(`
model Foo {
    id Int @id @default(autoincrement())
    intNumber Int @gt(0)
    floatNumber Float @gt(0)
    decimalNumber Decimal @gt(0.1) @lte(10)
}
        `);

        const schema = zodSchemas.models.FooUpdateSchema;
        expect(schema.safeParse({ intNumber: 0 }).success).toBeFalsy();
        expect(schema.safeParse({ intNumber: 1 }).success).toBeTruthy();
        expect(schema.safeParse({ floatNumber: 0 }).success).toBeFalsy();
        expect(schema.safeParse({ floatNumber: 1.1 }).success).toBeTruthy();
        expect(schema.safeParse({ decimalNumber: 0 }).success).toBeFalsy();
        expect(schema.safeParse({ decimalNumber: '0' }).success).toBeFalsy();
        expect(schema.safeParse({ decimalNumber: new Decimal(0) }).success).toBeFalsy();
        expect(schema.safeParse({ decimalNumber: 11 }).success).toBeFalsy();
        expect(schema.safeParse({ decimalNumber: '11.123456789' }).success).toBeFalsy();
        expect(schema.safeParse({ decimalNumber: new Decimal('11.123456789') }).success).toBeFalsy();
        expect(schema.safeParse({ decimalNumber: 10 }).success).toBeTruthy();
        expect(schema.safeParse({ decimalNumber: '10' }).success).toBeTruthy();
        expect(schema.safeParse({ decimalNumber: new Decimal('10') }).success).toBeTruthy();
    });
});
