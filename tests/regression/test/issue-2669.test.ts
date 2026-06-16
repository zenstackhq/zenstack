import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2669
describe.each([{ provider: 'sqlite' as const }, { provider: 'postgresql' as const }])(
    'Regression for issue 2669 ($provider)',
    ({ provider }) => {
        const schema = `
datasource db {
    provider = '${provider}'
    url = '${provider === 'sqlite' ? 'file:./dev.db' : '$DB_URL'}'
}

model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    posts Post[]
}

model Post {
    id        Int       @id @default(autoincrement())
    title     String
    author    User      @relation(fields: [authorId], references: [id])
    authorId  Int
    comments  Comment[]
}

model Comment {
    id      Int    @id @default(autoincrement())
    content String
    post    Post   @relation(fields: [postId], references: [id])
    postId  Int
}
`;

        it('supports _count inside a nested include', async () => {
            const db = await createTestClient(schema, {
                provider,
            });

            await db.user.create({
                data: {
                    email: 'user1@test.com',
                    posts: {
                        create: {
                            title: 'Post1',
                            comments: {
                                create: [{ content: 'c1' }, { content: 'c2' }],
                            },
                        },
                    },
                },
            });

            const result = await db.user.findMany({
                include: {
                    posts: {
                        include: {
                            _count: {
                                select: { comments: true },
                            },
                        },
                    },
                },
            });

            expect(result).toHaveLength(1);
            expect(result[0]!.posts).toHaveLength(1);
            expect(result[0]!.posts[0]!._count).toEqual({ comments: 2 });
        });
    },
);
