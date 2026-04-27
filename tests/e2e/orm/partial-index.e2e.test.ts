import { PrismaSchemaGenerator } from '@zenstackhq/sdk';
import { loadSchema } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('e2e: partial index in ZModel', () => {
    it('should generate Prisma schema with partial index', async () => {
        const model = await loadSchema(`
datasource db {
    provider = 'postgresql'
    url = 'env("DATABASE_URL")'
}

model Post {
    id        Int     @id @default(autoincrement())
    title     String
    published Boolean

    @@index([title], where: { published: true })
    @@unique([title], where: raw("published = true"))
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const schema = await generator.generate();
        expect(schema).toContain('partialIndexes');
        expect(schema).toContain('@@index([title], where: { published: true })');
        expect(schema).toContain('@@unique([title], where: raw("published = true"))');
    });
});
