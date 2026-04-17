import { describe, expect, it } from 'vitest';
import { createTestClient } from '@zenstackhq/testtools';

describe('Mixin tests', () => {
    it('includes fields and attributes from mixins', async () => {
        const schema = `
type TimeStamped {
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}

type Named {
    name String
    @@unique([name])
}

type CommonFields with TimeStamped Named {
    id String @id @default(cuid())
}

model Foo with TimeStamped {
    id String @id @default(cuid())
    title String
}

model Bar with CommonFields {
    description String
}
    `;

        const client = await createTestClient(schema, {
            usePrismaPush: true,
        });

        await expect(
            client.foo.create({
                data: {
                    title: 'Foo',
                },
            }),
        ).resolves.toMatchObject({
            id: expect.any(String),
            title: 'Foo',
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });

        await expect(
            client.bar.create({
                data: {
                    description: 'Bar',
                },
            }),
        ).rejects.toThrow(/invalid/i);

        await expect(
            client.bar.create({
                data: {
                    name: 'Bar',
                    description: 'Bar',
                },
            }),
        ).resolves.toMatchObject({
            id: expect.any(String),
            name: 'Bar',
            description: 'Bar',
            createdAt: expect.any(Date),
            updatedAt: expect.any(Date),
        });

        await expect(
            client.bar.create({
                data: {
                    name: 'Bar',
                    description: 'Bar',
                },
            }),
        ).rejects.toSatisfy((e) => e.cause.message.toLowerCase().match(/(constraint)|(duplicate)/i));
    });

    it('supports multiple-level mixins', async () => {
        const schema = `
        type Base1 {
            id    String @id @default(cuid())
        }

        type Base2 with Base1 {
            fieldA String
        }
          
        model A with Base2 {
            field String
            b B[]
        }

        model B {
            id    String @id @default(cuid())
            a     A @relation(fields: [aId], references: [id])
            aId   String
          }
        `;

        const client = await createTestClient(schema);
        await expect(
            client.b.create({
                data: {
                    a: {
                        create: {
                            field: 'test',
                            fieldA: 'testA',
                        },
                    },
                },
                include: { a: true },
            }),
        ).resolves.toMatchObject({
            a: {
                id: expect.any(String),
                field: 'test',
                fieldA: 'testA',
            },
        });
    });

    it('supports non-owned (array-side) relation fields in mixin shared by multiple models', async () => {
        const schema = `
type WithComments {
    comments Comment[]
}

model Post with WithComments {
    id    String @id @default(cuid())
    title String
}

model Article with WithComments {
    id      String @id @default(cuid())
    content String
}

model Comment {
    id        String   @id @default(cuid())
    text      String
    post      Post?    @relation(fields: [postId], references: [id])
    postId    String?
    article   Article? @relation(fields: [articleId], references: [id])
    articleId String?
}
        `;

        const client = await createTestClient(schema, { usePrismaPush: true });

        const post = await client.post.create({ data: { title: 'My Post' } });
        const article = await client.article.create({ data: { content: 'My Article' } });

        await client.comment.create({ data: { text: 'Post comment', postId: post.id } });
        await client.comment.create({ data: { text: 'Article comment', articleId: article.id } });

        await expect(
            client.post.findUnique({ where: { id: post.id }, include: { comments: true } }),
        ).resolves.toMatchObject({
            title: 'My Post',
            comments: [{ text: 'Post comment' }],
        });

        await expect(
            client.article.findUnique({ where: { id: article.id }, include: { comments: true } }),
        ).resolves.toMatchObject({
            content: 'My Article',
            comments: [{ text: 'Article comment' }],
        });
    });

    it('supports owned (FK-side) relation fields in mixin shared by multiple models', async () => {
        const schema = `
type WithAuthor {
    author   User   @relation(fields: [authorId], references: [id])
    authorId String
}

model User {
    id       String    @id @default(cuid())
    posts    Post[]
    articles Article[]
}

model Post with WithAuthor {
    id    String @id @default(cuid())
    title String
}

model Article with WithAuthor {
    id      String @id @default(cuid())
    content String
}
        `;

        const client = await createTestClient(schema, { usePrismaPush: true });

        const user = await client.user.create({ data: {} });

        const post = await client.post.create({
            data: { title: 'My Post', authorId: user.id },
            include: { author: true },
        });
        expect(post).toMatchObject({ title: 'My Post', author: { id: user.id } });

        const article = await client.article.create({
            data: { content: 'My Article', authorId: user.id },
            include: { author: true },
        });
        expect(article).toMatchObject({ content: 'My Article', author: { id: user.id } });

        await expect(
            client.user.findUnique({ where: { id: user.id }, include: { posts: true, articles: true } }),
        ).resolves.toMatchObject({
            posts: [{ title: 'My Post' }],
            articles: [{ content: 'My Article' }],
        });
    });

    it('works with multiple id fields from base', async () => {
        const schema = `
        type Base {
            id1 String
            id2 String
            value String
            @@id([id1, id2])
        }

        model Item with Base {
            x String
        }
        `;

        const client = await createTestClient(schema);
        await expect(
            client.item.create({
                data: { id1: '1', id2: '2', value: 'test', x: 'x' },
            }),
        ).resolves.toMatchObject({
            id1: '1',
            id2: '2',
        });
    });

    it('resolves opposite relation correctly when a relation field is inherited from a delegate base', async () => {
        // Regression: getOppositeRelationField was using contextModel (e.g. Person) as the source
        // for the opposite-relation lookup, but the back-reference points to the delegate base
        // (Entity), not the concrete subtype. This caused the nested-create TypeScript type to
        // collapse to `undefined`.
        const schema = `
type WithName {
    name String
}

model Attachment {
    id       String @id @default(cuid())
    url      String
    entityId String
    entity   Entity @relation(fields: [entityId], references: [id])
}

model Entity with WithName {
    id          String       @id @default(cuid())
    attachments Attachment[]
    type        String
    @@delegate(type)
}

model Person extends Entity {
    age Int?
}
        `;

        const client = await createTestClient(schema, { usePrismaPush: true });

        await expect(
            client.person.create({
                data: {
                    name: 'Alice',
                    attachments: { create: { url: 'https://example.com' } },
                },
                include: { attachments: true },
            }),
        ).resolves.toMatchObject({
            name: 'Alice',
            attachments: [{ url: 'https://example.com', entityId: expect.any(String) }],
        });
    });
});
