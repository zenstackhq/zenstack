import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2844
describe('Regression for issue 2844', () => {
    const schema = `
type Bounds {
    caption String @length(1, 3)
    low     Int    @gte(0)
    high    Int

    @@validate(low <= high, 'low must not exceed high')
}

model Example {
    id     Int    @id
    bounds Bounds @json
}
`;

    it('enforces custom type validation rules on create', async () => {
        const db = await createTestClient(schema);

        await expect(
            db.example.create({ data: { id: 1, bounds: { caption: 'too long', low: 0, high: 1 } } }),
        ).toBeRejectedByValidation(['data.bounds.caption']);
        await expect(
            db.example.create({ data: { id: 1, bounds: { caption: 'ok', low: -1, high: 1 } } }),
        ).toBeRejectedByValidation(['data.bounds.low']);
        await expect(
            db.example.create({ data: { id: 1, bounds: { caption: 'ok', low: 5, high: 1 } } }),
        ).toBeRejectedByValidation(['low must not exceed high']);

        await expect(
            db.example.create({ data: { id: 1, bounds: { caption: 'abc', low: 0, high: 0 } } }),
        ).resolves.toMatchObject({ bounds: { caption: 'abc', low: 0, high: 0 } });
    });

    it('enforces custom type validation rules on update', async () => {
        const db = await createTestClient(schema);
        await db.example.create({ data: { id: 1, bounds: { caption: 'ok', low: 0, high: 1 } } });

        await expect(
            db.example.update({ where: { id: 1 }, data: { bounds: { caption: 'too long', low: 0, high: 1 } } }),
        ).toBeRejectedByValidation(['data.bounds.caption']);
        await expect(
            db.example.update({ where: { id: 1 }, data: { bounds: { caption: 'ok', low: -1, high: 1 } } }),
        ).toBeRejectedByValidation(['data.bounds.low']);
        await expect(
            db.example.update({ where: { id: 1 }, data: { bounds: { caption: 'ok', low: 5, high: 1 } } }),
        ).toBeRejectedByValidation(['low must not exceed high']);

        await expect(db.example.findUnique({ where: { id: 1 } })).resolves.toMatchObject({
            bounds: { caption: 'ok', low: 0, high: 1 },
        });
    });

    it('enforces validation rules of nested custom types and list fields', async () => {
        const db = await createTestClient(`
type Item {
    name String @length(1, 5)
}

type Cart {
    owner String @email
    items Item[] @length(1, 2)
}

model Order {
    id   Int  @id
    cart Cart @json
}
`);

        await expect(
            db.order.create({ data: { id: 1, cart: { owner: 'not-an-email', items: [{ name: 'a' }] } } }),
        ).toBeRejectedByValidation(['data.cart.owner']);
        await expect(
            db.order.create({ data: { id: 1, cart: { owner: 'a@b.com', items: [{ name: 'too long' }] } } }),
        ).toBeRejectedByValidation(['data.cart.items[0].name']);
        await expect(
            db.order.create({ data: { id: 1, cart: { owner: 'a@b.com', items: [] } } }),
        ).toBeRejectedByValidation(['data.cart.items']);
        await expect(
            db.order.create({
                data: { id: 1, cart: { owner: 'a@b.com', items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } },
            }),
        ).toBeRejectedByValidation(['data.cart.items']);

        await expect(
            db.order.create({ data: { id: 1, cart: { owner: 'a@b.com', items: [{ name: 'apple' }] } } }),
        ).resolves.toMatchObject({ cart: { owner: 'a@b.com', items: [{ name: 'apple' }] } });
    });
});
