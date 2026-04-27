import { PrismaSchemaGenerator } from '@zenstackhq/sdk';
import { loadSchema } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('PrismaSchemaGenerator partial index', () => {
    it('should generate @@index with raw() SQL where predicate', async () => {
        const model = await loadSchema(`
datasource db {
    provider = 'postgresql'
    url = 'env("DATABASE_URL")'
}

model Foo {
    id Int @id
    @@index([id], where: raw("id > 0"))
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const schema = await generator.generate();
        expect(schema).toContain('partialIndexes');
        expect(schema).toContain('@@index([id], where: raw("id > 0"))');
    });

    it('should generate @@index with object where predicate', async () => {
        const model = await loadSchema(`
datasource db {
    provider = 'postgresql'
    url = 'env("DATABASE_URL")'
}

model Foo {
    id        Int     @id
    published Boolean
    @@index([id], where: { published: true })
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const schema = await generator.generate();
        expect(schema).toContain('partialIndexes');
        expect(schema).toContain('@@index([id], where: { published: true })');
    });

    it('should generate @@unique with raw() SQL where predicate', async () => {
        const model = await loadSchema(`
datasource db {
    provider = 'postgresql'
    url = 'env("DATABASE_URL")'
}

model Foo {
    id    Int    @id
    email String
    @@unique([email], where: raw("email IS NOT NULL"))
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const schema = await generator.generate();
        expect(schema).toContain('partialIndexes');
        expect(schema).toContain('@@unique([email], where: raw("email IS NOT NULL"))');
    });
});
