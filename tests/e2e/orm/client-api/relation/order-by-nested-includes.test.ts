import { afterEach, describe, expect, it } from 'vitest';
import { createTestClient } from '@zenstackhq/testtools';

const TEST_DB = 'order-by-nested-includes';

const schema = `
model User {
    id String @id
    email String @unique
    posts Post[]
    comments Comment[]
}

model Post {
    id String @id
    sequence Int
    title String
    author User @relation(fields: [authorId], references: [id])
    authorId String
    comments Comment[]
}

model Comment {
    id String @id
    content String
    post Post @relation(fields: [postId], references: [id])
    postId String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
}
`;

function makePostsData(count: number) {
    return Array.from({ length: count }, (_, i) => {
        const sequence = count - i; // insert descending
        return {
            id: `p${sequence}`,
            sequence,
            title: `P${sequence}`,
            // Keep outer relation (User -> posts) required.
            authorId: 'u1',
        };
    });
}

function makeCommentsData(count: number) {
    return Array.from({ length: count }, (_, i) => {
        const sequence = count - i;
        return {
            id: `c${sequence}`,
            postId: `p${sequence}`,
            content: `C${sequence}`,
            // Make nested to-one include nullable to vary lateral join execution.
            authorId: sequence % 11 === 0 ? null : 'u1',
        };
    });
}

describe.each([{ provider: 'sqlite' as const }, { provider: 'postgresql' as const }, {provider: 'mysql' as const}])(
    'Relation orderBy with nested includes ($provider)',
    ({ provider }) => {
        let db: any;

        afterEach(async () => {
            await db?.$disconnect();
        });

        it('keeps stable order for to-many include with nested includes', async () => {
            const count = provider === 'postgresql' ? 2000 : 10;

            db = await createTestClient(schema, {
                provider,
                dbName: `${TEST_DB}-${provider}-count-${count}`,
                debug:true,
            });

            await db.user.create({ data: { id: 'u1', email: 'u1@example.com' } });
            await db.post.createMany({ data: makePostsData(count) });
            await db.comment.createMany({ data: makeCommentsData(count) });

            const user = await db.user.findFirst({
                where: { id: 'u1' },
                include: {
                    posts: {
                        orderBy: { sequence: 'asc' },
                        include: { author: true, comments: { include: { author: true } } },
                    },
                },
            });

            const ascSequences = user.posts.map((p: any) => p.sequence);
            expect(ascSequences).toEqual(Array.from({ length: count }, (_, i) => i + 1));

            const userDesc = await db.user.findFirst({
                where: { id: 'u1' },
                include: {
                    posts: {
                        orderBy: { sequence: 'desc' },
                        include: { author: true, comments: { include: { author: true } } },
                    },
                },
            });

            const descSequences = userDesc.posts.map((p: any) => p.sequence)
            expect(descSequences).toEqual(Array.from({ length: count }, (_, i) => count - i));
        });

        it('keeps stable order for to-many select with nested selects', async () => {
            const count = provider === 'postgresql' ? 2000 : 10;

            db = await createTestClient(schema, {
                provider,
                dbName: `${TEST_DB}-${provider}-select-count-${count}`,
            });

            await db.user.create({ data: { id: 'u1', email: 'u1@example.com' } });
            await db.post.createMany({ data: makePostsData(count) });
            await db.comment.createMany({ data: makeCommentsData(count) });

            const user = await db.user.findFirst({
                where: { id: 'u1' },
                select: {
                    id: true,
                    posts: {
                        orderBy: { sequence: 'asc' },
                        select: {
                            sequence: true,
                            author: { select: { id: true } },
                            comments: { select: { author: { select: { id: true } } } },
                        },
                    },
                },
            });

            const ascSequences = user.posts.map((p: any) => p.sequence);
            expect(ascSequences).toEqual(Array.from({ length: count }, (_, i) => i + 1));

            const userDesc = await db.user.findFirst({
                where: { id: 'u1' },
                select: {
                    id: true,
                    posts: {
                        orderBy: { sequence: 'desc' },
                        select: {
                            sequence: true,
                            author: { select: { id: true } },
                            comments: { select: { author: { select: { id: true } } } },
                        },
                    },
                },
            });

            const descSequences = userDesc.posts.map((p: any) => p.sequence);
            expect(descSequences).toEqual(Array.from({ length: count }, (_, i) => count - i));
        });
    },
);
