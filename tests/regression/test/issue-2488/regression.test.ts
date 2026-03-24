import { createTestClient } from '@zenstackhq/testtools';
import { it, expect } from 'vitest';
import { schema } from './schema';

// https://github.com/zenstackhq/zenstack/issues/2488
// `include` should not be allowed on models without relation fields.

it('should not allow include on model with no relations', async () => {
    const db = await createTestClient(schema);

    // @ts-expect-error - `include` should not be allowed on models without relations
    void db.dummy.findFirst({ include: { foo: true } });

    // verify findFirst still works without include
    const result = await db.dummy.findFirst();
    expect(result).toBeNull();
});
