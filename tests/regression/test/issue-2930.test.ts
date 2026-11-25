import { PrismaSchemaGenerator } from '@zenstackhq/sdk';
import { loadSchema } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2930', () => {
    it('strips ignore from @updatedAt without changing other attributes', async () => {
        const model = await loadSchema(`
model Post {
    id        String   @id @default(cuid())
    title     String
    views     Int      @default(0)
    updatedAt DateTime @default(now()) @updatedAt(ignore: [views]) @map('updated_at')
    empty     DateTime @updatedAt(ignore: [])
    plain     DateTime @updatedAt
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const prismaSchema = await generator.generate();

        expect(prismaSchema).toContain('updatedAt DateTime @default(now()) @updatedAt() @map("updated_at")');
        expect(prismaSchema).toContain('empty DateTime @updatedAt()');
        expect(prismaSchema).toContain('plain DateTime @updatedAt()');
        expect(prismaSchema).not.toContain('ignore:');
    });
});
