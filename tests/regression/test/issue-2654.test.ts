import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2654
describe('Regression for issue 2654', () => {
    it('handles cyclic references between JSON typedefs', async () => {
        const schema = `
type A {
    name String
    b    B
}

type B {
    a A[]
    x String
}

model User {
    id String @id @default(cuid())
    a  A      @json
}
`;

        const db = await createTestClient(schema, { provider: 'postgresql' });

        const data = {
            id: 'u1',
            a: { name: 'abc', b: { x: '123', a: [] } },
        };
        await expect(db.user.create({ data })).resolves.toMatchObject(data);

        const nested = {
            id: 'u2',
            a: {
                name: 'root',
                b: {
                    x: 'b1',
                    a: [{ name: 'inner', b: { x: 'b2', a: [] } }],
                },
            },
        };
        await expect(db.user.create({ data: nested })).resolves.toMatchObject(nested);
    });

    it('handles self-referencing JSON typedef', async () => {
        const schema = `
type Tree {
    name     String
    children Tree[]?
}

model Node {
    id   String @id @default(cuid())
    tree Tree   @json
}
`;

        const db = await createTestClient(schema, { provider: 'postgresql' });

        const data = {
            id: 'n1',
            tree: {
                name: 'root',
                children: [
                    { name: 'child1', children: [] },
                    { name: 'child2', children: [{ name: 'grandchild', children: [] }] },
                ],
            },
        };
        await expect(db.node.create({ data })).resolves.toMatchObject(data);
    });
});
