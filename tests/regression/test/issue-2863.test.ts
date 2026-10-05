import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2863', () => {
    const schema = `
model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    posts Post[]
}

model Post {
    id       Int    @id @default(autoincrement())
    title    String
    authorId Int
    author   User   @relation(fields: [authorId], references: [id])
}
`;

    async function setup() {
        const db = await createTestClient(schema);
        await db.user.create({
            data: { email: 'u1@zenstack.dev', posts: { create: [{ title: 'p1' }] } },
        });
        await db.user.create({
            data: { email: 'u2@example.com', posts: { create: [{ title: 'p2' }, { title: 'p3' }] } },
        });
        return db;
    }

    it('passes the model alias to top-level $expr', async () => {
        const db = await setup();
        let alias: string | undefined;

        const users = await db.user.findMany({
            where: {
                $expr: (eb: any, { modelAlias }: { modelAlias: string }) => {
                    alias = modelAlias;
                    return eb(eb.ref(`${modelAlias}.email`), 'like', '%@zenstack.dev');
                },
            },
        });

        expect(alias).toBe('User');
        expect(users.map((u: any) => u.email)).toEqual(['u1@zenstack.dev']);
    });

    it('passes the generated alias to $expr inside a to-one relation filter', async () => {
        const db = await setup();
        let alias: string | undefined;

        const posts = await db.post.findMany({
            where: {
                author: {
                    $expr: (eb: any, { modelAlias }: { modelAlias: string }) => {
                        alias = modelAlias;
                        return eb(eb.ref(`${modelAlias}.email`), 'like', '%@zenstack.dev');
                    },
                },
            },
        });

        expect(alias).not.toBe('User');
        expect(posts.map((p: any) => p.title)).toEqual(['p1']);
    });

    it('passes the generated alias to $expr inside a to-many relation filter', async () => {
        const db = await setup();

        const users = await db.user.findMany({
            where: {
                posts: {
                    some: {
                        $expr: (eb: any, { modelAlias }: { modelAlias: string }) =>
                            eb(eb.ref(`${modelAlias}.title`), '=', 'p3'),
                    },
                },
            },
        });

        expect(users.map((u: any) => u.email)).toEqual(['u2@example.com']);
    });

    it('keeps supporting unqualified references inside relation filters', async () => {
        const db = await setup();

        const posts = await db.post.findMany({
            where: {
                author: {
                    $expr: (eb: any) => eb('email', 'like', '%@zenstack.dev'),
                },
            },
        });

        expect(posts.map((p: any) => p.title)).toEqual(['p1']);
    });
});
