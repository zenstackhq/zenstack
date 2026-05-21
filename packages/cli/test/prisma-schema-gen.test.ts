import { loadSchema } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { PrismaSchemaGenerator } from '@zenstackhq/sdk';

describe('Prisma schema generation tests', () => {
    it('strips format args from id functions', async () => {
        const model = await loadSchema(`
model User {
    id       Int    @id @default(autoincrement())

    cuid     String @default(cuid())
    cuid1    String @default(cuid(1, 'cuid1_%s'))
    cuid2    String @default(cuid(2, 'cuid2_%s'))

    uuid     String @default(uuid())
    uuid4    String @default(uuid(4, 'uuid4_%s'))
    uuid7    String @default(uuid(7, 'uuid7_%s'))

    ulid     String @default(ulid())
    ulid1    String @default(ulid('ulid_%s'))

    nanoid   String @default(nanoid())
    nanoid12 String @default(nanoid(12, 'nanoid12_%s'))
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const prismaSchemaText = await generator.generate();

        expect(prismaSchemaText.includes('cuid()')).toBe(true);
        expect(prismaSchemaText.includes('cuid(1)')).toBe(true);
        expect(prismaSchemaText.includes('cuid(2)')).toBe(true);

        expect(prismaSchemaText.includes('uuid()')).toBe(true);
        expect(prismaSchemaText.includes('uuid(4)')).toBe(true);
        expect(prismaSchemaText.includes('uuid(7)')).toBe(true);

        expect(prismaSchemaText.match(/ulid\(\)/g)).toHaveLength(2);

        expect(prismaSchemaText.includes('nanoid()')).toBe(true);
        expect(prismaSchemaText.includes('nanoid(12)')).toBe(true);
    });
});