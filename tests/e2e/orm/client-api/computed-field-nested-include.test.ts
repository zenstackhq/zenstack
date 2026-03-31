import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// Bug: when a model with @computed fields inherited from a mixin type (the `with`
// keyword) is fetched as a nested relation via an explicit `include`, ZenStack
// emits the computed field name as a raw column reference inside `jsonb_build_object`
// while the inner subquery SELECT only contains the real DB columns. This causes
// PostgreSQL to fail with:
//   "column $$tN.field_name does not exist"
//
// Root cause: `buildSelectField` uses `fieldDef.originModel` (the mixin type name)
// as the table alias when selecting the computed field into the inner subquery.
// But the inner subquery aliases the actual table under the model name, not the
// mixin type name, so the correlated subquery is never emitted and `parentCode`
// is absent from the subquery's SELECT list. The outer `jsonb_build_object` then
// references `$$tN.parentCode` which does not exist.
//
// The bug does NOT occur when:
//   - the @computed field is declared directly on the model (not via a mixin type)
//   - the relation is not explicitly included
//   - the model is queried directly (not as a nested include)

describe('Computed fields with nested include', () => {
    it('includes computed fields inherited from a mixin type when the model is explicitly included', async () => {
        const db = await createTestClient(
            `
type ParentRelated {
    parentCode String? @computed
}

model Parent {
    id       Int     @id @default(autoincrement())
    code     String
    children Child[]
}

model Child with ParentRelated {
    id       Int     @id @default(autoincrement())
    name     String
    parentId Int
    parent   Parent  @relation(fields: [parentId], references: [id])
}
            `,
            {
                provider: 'postgresql',
                computedFields: {
                    Child: {
                        // Correlated subquery — looks up Parent.code via the FK.
                        // The computed field is inherited from the `ParentRelated` mixin,
                        // so fieldDef.originModel === 'ParentRelated', which is the
                        // alias incorrectly used by buildSelectField.
                        parentCode: (eb: any) =>
                            eb
                                .selectFrom('Parent')
                                .select('Parent.code')
                                .whereRef('Parent.id', '=', 'parentId')
                                .limit(1),
                    },
                },
            } as any,
        );

        const parent = await db.parent.create({
            data: { code: 'P-001', children: { create: [{ name: 'Alice' }, { name: 'Bob' }] } },
        });

        // Direct query on Child works fine
        await expect(db.child.findFirst({ where: { parentId: parent.id } })).resolves.toMatchObject({
            parentCode: 'P-001',
        });

        // Querying Parent with include: { children: true } should also work,
        // but currently fails with "column $$tN.parentCode does not exist"
        await expect(
            db.parent.findFirst({
                where: { id: parent.id },
                include: { children: true },
            }),
        ).resolves.toMatchObject({
            code: 'P-001',
            children: expect.arrayContaining([
                expect.objectContaining({ name: 'Alice', parentCode: 'P-001' }),
                expect.objectContaining({ name: 'Bob', parentCode: 'P-001' }),
            ]),
        });
    });
});
