import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2757', () => {
    it('resolves the correct opposite field when only one of two relation pairs is named', async () => {
        const db = await createTestClient(
            `
model Category {
    id       String    @id @default(cuid())
    products Product[]                       // unnamed - opposite should be Product.category
    featured Product[] @relation("Featured")
}

model Product {
    id           String    @id @default(cuid())
    category     Category  @relation(fields: [categoryId], references: [id])
    categoryId   String
    featuredIn   Category? @relation("Featured", fields: [featuredInId], references: [id])
    featuredInId String?
}
            `,
        );

        const c1 = await db.category.create({ data: {} });
        const c2 = await db.category.create({ data: {} });

        // p1 belongs to c1, and is featured in c2
        await db.product.create({
            data: { id: 'p1', category: { connect: { id: c1.id } }, featuredIn: { connect: { id: c2.id } } },
        });

        // nested read traverses the right column
        await expect(
            db.category.findUnique({ where: { id: c1.id }, include: { products: true } }),
        ).resolves.toMatchObject({ products: [expect.objectContaining({ id: 'p1' })] });
        await expect(
            db.category.findUnique({ where: { id: c1.id }, include: { featured: true } }),
        ).resolves.toMatchObject({ featured: [] });
        await expect(
            db.category.findUnique({ where: { id: c2.id }, include: { products: true } }),
        ).resolves.toMatchObject({ products: [] });
        await expect(
            db.category.findUnique({ where: { id: c2.id }, include: { featured: true } }),
        ).resolves.toMatchObject({ featured: [expect.objectContaining({ id: 'p1' })] });

        // relation filters traverse the right column
        await expect(db.category.findMany({ where: { products: { none: {} } } })).resolves.toEqual([
            expect.objectContaining({ id: c2.id }),
        ]);
        await expect(db.category.findMany({ where: { products: { some: {} } } })).resolves.toEqual([
            expect.objectContaining({ id: c1.id }),
        ]);
        await expect(db.category.findMany({ where: { featured: { none: {} } } })).resolves.toEqual([
            expect.objectContaining({ id: c1.id }),
        ]);
        await expect(db.category.findMany({ where: { featured: { some: {} } } })).resolves.toEqual([
            expect.objectContaining({ id: c2.id }),
        ]);
    });

    it('resolves the correct opposite field when the named relation is declared first', async () => {
        const db = await createTestClient(
            `
model Category {
    id       String    @id @default(cuid())
    featured Product[] @relation("Featured")
    products Product[]
}

model Product {
    id           String    @id @default(cuid())
    featuredIn   Category? @relation("Featured", fields: [featuredInId], references: [id])
    featuredInId String?
    category     Category  @relation(fields: [categoryId], references: [id])
    categoryId   String
}
            `,
        );

        const c1 = await db.category.create({ data: {} });
        const c2 = await db.category.create({ data: {} });

        await db.product.create({
            data: { id: 'p1', category: { connect: { id: c1.id } }, featuredIn: { connect: { id: c2.id } } },
        });

        await expect(db.category.findMany({ where: { products: { some: {} } } })).resolves.toEqual([
            expect.objectContaining({ id: c1.id }),
        ]);
        await expect(db.category.findMany({ where: { featured: { some: {} } } })).resolves.toEqual([
            expect.objectContaining({ id: c2.id }),
        ]);
    });
});
