import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2603
// Implicit many-to-many join tables live in the same schema as their models.
// The ORM must derive that schema from the models involved rather than
// defaulting to 'public', which would generate SQL referencing a non-existent relation.
describe('Regression for issue 2603', () => {
    it('implicit m2m with defaultSchema set to non-public schema', async () => {
        const db = await createTestClient(
            `
datasource db {
    provider = 'postgresql'
    schemas = ['public', 'mySchema']
    defaultSchema = 'mySchema'
    url = '$DB_URL'
}

model Post {
    id   Int    @id @default(autoincrement())
    tags Tag[]
}

model Tag {
    id    Int    @id @default(autoincrement())
    name  String
    posts Post[]
}
`,
            {
                provider: 'postgresql',
                usePrismaPush: true,
            },
        );

        const post = await db.post.create({
            data: {
                tags: {
                    create: [{ name: 'foo' }, { name: 'bar' }],
                },
            },
            include: { tags: true },
        });

        expect(post.tags).toHaveLength(2);
        expect(post.tags.map((t: any) => t.name).sort()).toEqual(['bar', 'foo']);

        const fetched = await db.post.findFirst({ include: { tags: true } });
        expect(fetched?.tags).toHaveLength(2);
    });

    it('implicit m2m with explicit @@schema on models', async () => {
        const db = await createTestClient(
            `
datasource db {
    provider = 'postgresql'
    schemas = ['public', 'mySchema']
    url = '$DB_URL'
}

model Post {
    id   Int    @id @default(autoincrement())
    tags Tag[]
    @@schema('mySchema')
}

model Tag {
    id    Int    @id @default(autoincrement())
    name  String
    posts Post[]
    @@schema('mySchema')
}
`,
            {
                provider: 'postgresql',
                usePrismaPush: true,
            },
        );

        const post = await db.post.create({
            data: {
                tags: {
                    create: [{ name: 'alpha' }, { name: 'beta' }],
                },
            },
            include: { tags: true },
        });

        expect(post.tags).toHaveLength(2);
        expect(post.tags.map((t: any) => t.name).sort()).toEqual(['alpha', 'beta']);
    });

    it('implicit m2m with models in different custom schemas', async () => {
        // Prisma places the join table in the schema of the alphabetically-first model
        // (_PostToTag goes to schema1 because 'Post' < 'Tag').
        const db = await createTestClient(
            `
datasource db {
    provider = 'postgresql'
    schemas = ['schema1', 'schema2', 'public']
    url = '$DB_URL'
}

model Post {
    id   Int    @id @default(autoincrement())
    tags Tag[]
    @@schema('schema1')
}

model Tag {
    id    Int    @id @default(autoincrement())
    name  String
    posts Post[]
    @@schema('schema2')
}
`,
            {
                provider: 'postgresql',
                usePrismaPush: true,
            },
        );

        const post = await db.post.create({
            data: { tags: { create: [{ name: 'foo' }] } },
            include: { tags: true },
        });
        expect(post.tags.map((t: any) => t.name)).toEqual(['foo']);
    });
});
