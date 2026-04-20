import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2540', () => {
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

        // Querying Parent with include: { children: true } should also work
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
