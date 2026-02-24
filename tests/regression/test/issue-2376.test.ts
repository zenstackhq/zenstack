import { PrismaSchemaGenerator } from '@zenstackhq/sdk';
import { loadSchema } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2376
describe('Regression for issue 2376', () => {
    it('should include views preview feature when schema contains views', async () => {
        const model = await loadSchema(`
datasource db {
    provider = 'sqlite'
    url = 'file:./test.db'
}

model User {
    id    Int     @id @default(autoincrement())
    email String  @unique
    name  String?
    posts Post[]
}

model Post {
    id       Int     @id @default(autoincrement())
    title    String
    author   User?   @relation(fields: [authorId], references: [id])
    authorId Int?
}

view UserPostCount {
    id        Int    @unique
    name      String
    postCount Int
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const prismaSchema = await generator.generate();

        // The generated Prisma schema should include previewFeatures with "views"
        expect(prismaSchema).toContain('previewFeatures');
        expect(prismaSchema).toContain('views');
    });
});
