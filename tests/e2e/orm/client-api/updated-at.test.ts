import { describe, expect, it } from 'vitest';
import { createTestClient } from '@zenstackhq/testtools';

describe('@updatedAt attribute', () => {
    describe('fields arg', () => {
        const schema = `
            model User {
                id      String    @id @default(uuid())
                name String
                email String @default('test@test.com')
                age Int @default(18)
                address String @default('Fake Street')

                nameUpdatedAt DateTime @updatedAt(fields: [name])
                emailUpdatedAt DateTime @updatedAt(fields: [email])
                majorFieldUpdatedAt DateTime @updatedAt(fields: [name, email])
                emptyFieldUpdatedAt DateTime @updatedAt(fields: [])
                anyFieldUpdatedAt DateTime @updatedAt
            }
        `;

        it('updates if any targeted field changes', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({
                data: {
                    name: 'test',
                },
            });
            const nameUpdatedAt = user.nameUpdatedAt;
            const majorFieldUpdatedAt = user.majorFieldUpdatedAt;

            await client.user.update({
                data: {
                    name: 'test2',
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser1 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser1.nameUpdatedAt.getTime()).toBeGreaterThan(nameUpdatedAt.getTime());
            expect(updatedUser1.emailUpdatedAt.getTime()).toEqual(user.emailUpdatedAt.getTime());
            expect(updatedUser1.majorFieldUpdatedAt.getTime()).toBeGreaterThan(majorFieldUpdatedAt.getTime());

            await client.user.update({
                data: {
                    name: 'test3',
                    email: 'test3@test.com',
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser2 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser2.nameUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.nameUpdatedAt.getTime());
            expect(updatedUser2.emailUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.emailUpdatedAt.getTime());
            expect(updatedUser2.majorFieldUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.majorFieldUpdatedAt.getTime());
        });

        it('does not update if any non-targeted field changes', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({
                data: {
                    name: 'test',
                },
            });
            const nameUpdatedAt = user.nameUpdatedAt;
            const emailUpdatedAt = user.emailUpdatedAt;
            const majorFieldUpdatedAt = user.majorFieldUpdatedAt;
            const emptyFieldUpdatedAt = user.emptyFieldUpdatedAt;

            await client.user.update({
                data: {
                    age: 19,
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser1 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser1.nameUpdatedAt.getTime()).toEqual(nameUpdatedAt.getTime());
            expect(updatedUser1.emailUpdatedAt.getTime()).toEqual(emailUpdatedAt.getTime());
            expect(updatedUser1.majorFieldUpdatedAt.getTime()).toEqual(majorFieldUpdatedAt.getTime());
            expect(updatedUser1.emptyFieldUpdatedAt.getTime()).toEqual(emptyFieldUpdatedAt.getTime());

            await client.user.update({
                data: {
                    age: 20,
                    address: 'Fake Road',
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser2 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser2.nameUpdatedAt.getTime()).toEqual(updatedUser1.nameUpdatedAt.getTime());
            expect(updatedUser2.emailUpdatedAt.getTime()).toEqual(updatedUser1.emailUpdatedAt.getTime());
            expect(updatedUser2.majorFieldUpdatedAt.getTime()).toEqual(updatedUser1.majorFieldUpdatedAt.getTime());
            expect(updatedUser2.emptyFieldUpdatedAt.getTime()).toEqual(emptyFieldUpdatedAt.getTime());
        });
    });

    describe('ignore arg', () => {
        const schema = `
            model User {
                id      String    @id @default(uuid())
                name String
                email String @default('test@test.com')
                age Int @default(18)
                address String @default('Fake Street')

                exceptNameUpdatedAt DateTime @updatedAt(ignore: [name])
                exceptEmailUpdatedAt DateTime @updatedAt(ignore: [email])
                exceptMajorFieldUpdatedAt DateTime @updatedAt(ignore: [name, email])
                emptyFieldUpdatedAt DateTime @updatedAt(ignore: [])
                anyFieldUpdatedAt DateTime @updatedAt
            }
        `;

        it('updates if any non-ignored fields are present', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({
                data: {
                    name: 'test',
                },
            });
            const exceptNameUpdatedAt = user.exceptNameUpdatedAt;
            const exceptMajorFieldUpdatedAt = user.exceptMajorFieldUpdatedAt;
            const emptyFieldUpdatedAt = user.emptyFieldUpdatedAt;
            const anyFieldUpdatedAt = user.anyFieldUpdatedAt;

            await client.user.update({
                data: {
                    age: 19,
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser1 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser1.exceptNameUpdatedAt.getTime()).toBeGreaterThan(exceptNameUpdatedAt.getTime());
            expect(updatedUser1.exceptMajorFieldUpdatedAt.getTime()).toBeGreaterThan(exceptMajorFieldUpdatedAt.getTime());
            expect(updatedUser1.emptyFieldUpdatedAt.getTime()).toBeGreaterThan(emptyFieldUpdatedAt.getTime());
            expect(updatedUser1.anyFieldUpdatedAt.getTime()).toBeGreaterThan(anyFieldUpdatedAt.getTime());

            await client.user.update({
                data: {
                    age: 20,
                    name: 'test4',
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser2 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser2.exceptNameUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.exceptNameUpdatedAt.getTime());
            expect(updatedUser2.exceptMajorFieldUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.exceptMajorFieldUpdatedAt.getTime());
            expect(updatedUser2.emptyFieldUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.emptyFieldUpdatedAt.getTime());
            expect(updatedUser2.anyFieldUpdatedAt.getTime()).toBeGreaterThan(updatedUser1.anyFieldUpdatedAt.getTime());
        });

        it('does not update if only ignored fields are present', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({
                data: {
                    name: 'test',
                },
            });
            const exceptNameUpdatedAt = user.exceptNameUpdatedAt;
            const exceptEmailUpdatedAt = user.exceptEmailUpdatedAt;
            const exceptMajorFieldUpdatedAt = user.exceptMajorFieldUpdatedAt;

            await client.user.update({
                data: {
                    name: 'test2',
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser1 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser1.exceptNameUpdatedAt.getTime()).toEqual(exceptNameUpdatedAt.getTime());
            expect(updatedUser1.exceptEmailUpdatedAt.getTime()).toBeGreaterThan(exceptEmailUpdatedAt.getTime());
            expect(updatedUser1.exceptMajorFieldUpdatedAt.getTime()).toEqual(exceptMajorFieldUpdatedAt.getTime());

            await client.user.update({
                data: {
                    name: 'test3',
                    email: 'test3@test.com',
                },

                where: {
                    id: user.id,
                },
            });

            const updatedUser2 = await client.user.findUnique({
                where: {
                    id: user.id,
                },
            });

            expect(updatedUser2.exceptMajorFieldUpdatedAt.getTime()).toEqual(updatedUser1.exceptMajorFieldUpdatedAt.getTime());
        });
    });

    describe('fields arg with relations', () => {
        const schema = `
            model User {
                id      String    @id @default(uuid())
                name    String
                posts   Post[]
            }

            model Post {
                id      String    @id @default(uuid())
                title   String
                content String @default('default content')
                userId  String?
                user    User? @relation(fields: [userId], references: [id])

                userUpdatedAt     DateTime @updatedAt(fields: [user])
                userIdUpdatedAt   DateTime @updatedAt(fields: [userId])
                titleUpdatedAt    DateTime @updatedAt(fields: [title])
                anyUpdatedAt      DateTime @updatedAt
            }
        `;

        it('updates when relation connect matches fields: [relationName]', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({ data: { name: 'Alice' } });
            const post = await client.post.create({ data: { title: 'Post 1' } });

            const userUpdatedAt = post.userUpdatedAt;
            const userIdUpdatedAt = post.userIdUpdatedAt;
            const titleUpdatedAt = post.titleUpdatedAt;
            const anyUpdatedAt = post.anyUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: { user: { connect: { id: user.id } } },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.userUpdatedAt.getTime()).toBeGreaterThan(userUpdatedAt.getTime());
            expect(updatedPost.userIdUpdatedAt.getTime()).toBeGreaterThan(userIdUpdatedAt.getTime());
            expect(updatedPost.titleUpdatedAt.getTime()).toEqual(titleUpdatedAt.getTime());
            expect(updatedPost.anyUpdatedAt.getTime()).toBeGreaterThan(anyUpdatedAt.getTime());
        });

        it('updates when relation disconnect matches fields: [relationName]', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({ data: { name: 'Alice' } });
            const post = await client.post.create({
                data: { title: 'Post 1', user: { connect: { id: user.id } } },
            });

            const userUpdatedAt = post.userUpdatedAt;
            const titleUpdatedAt = post.titleUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: { user: { disconnect: true } },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.userUpdatedAt.getTime()).toBeGreaterThan(userUpdatedAt.getTime());
            expect(updatedPost.titleUpdatedAt.getTime()).toEqual(titleUpdatedAt.getTime());
        });

        it('updates fields: [relationName] when FK is set directly', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({ data: { name: 'Alice' } });
            const post = await client.post.create({ data: { title: 'Post 1' } });

            const userUpdatedAt = post.userUpdatedAt;
            const titleUpdatedAt = post.titleUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: { userId: user.id },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.userUpdatedAt.getTime()).toBeGreaterThan(userUpdatedAt.getTime());
            expect(updatedPost.titleUpdatedAt.getTime()).toEqual(titleUpdatedAt.getTime());
        });

        it('does not update when unrelated relation changes', async () => {
            const client = await createTestClient(schema);
            const post = await client.post.create({ data: { title: 'Post 1' } });

            const userUpdatedAt = post.userUpdatedAt;
            const userIdUpdatedAt = post.userIdUpdatedAt;
            const titleUpdatedAt = post.titleUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: { title: 'Updated title' },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.userUpdatedAt.getTime()).toEqual(userUpdatedAt.getTime());
            expect(updatedPost.userIdUpdatedAt.getTime()).toEqual(userIdUpdatedAt.getTime());
            expect(updatedPost.titleUpdatedAt.getTime()).toBeGreaterThan(titleUpdatedAt.getTime());
        });
    });

    describe('ignore arg with relations', () => {
        const schema = `
            model User {
                id      String    @id @default(uuid())
                name    String
                posts   Post[]
            }

            model Post {
                id      String    @id @default(uuid())
                title   String
                content String @default('default content')
                userId  String?
                user    User? @relation(fields: [userId], references: [id])

                ignoreUserUpdatedAt     DateTime @updatedAt(ignore: [user])
                ignoreUserIdUpdatedAt   DateTime @updatedAt(ignore: [userId])
                anyUpdatedAt            DateTime @updatedAt
            }
        `;

        it('does not update when only ignored relation changes via connect', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({ data: { name: 'Alice' } });
            const post = await client.post.create({ data: { title: 'Post 1' } });

            const ignoreUserUpdatedAt = post.ignoreUserUpdatedAt;
            const ignoreUserIdUpdatedAt = post.ignoreUserIdUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: { user: { connect: { id: user.id } } },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.ignoreUserUpdatedAt.getTime()).toEqual(ignoreUserUpdatedAt.getTime());
            expect(updatedPost.ignoreUserIdUpdatedAt.getTime()).toEqual(ignoreUserIdUpdatedAt.getTime());
        });

        it('updates when non-ignored fields change alongside ignored relation', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({ data: { name: 'Alice' } });
            const post = await client.post.create({ data: { title: 'Post 1' } });

            const ignoreUserUpdatedAt = post.ignoreUserUpdatedAt;
            const anyUpdatedAt = post.anyUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: {
                    title: 'Updated title',
                    user: { connect: { id: user.id } },
                },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.ignoreUserUpdatedAt.getTime()).toBeGreaterThan(ignoreUserUpdatedAt.getTime());
            expect(updatedPost.anyUpdatedAt.getTime()).toBeGreaterThan(anyUpdatedAt.getTime());
        });

        it('does not update when only ignored FK is set directly', async () => {
            const client = await createTestClient(schema);
            const user = await client.user.create({ data: { name: 'Alice' } });
            const post = await client.post.create({ data: { title: 'Post 1' } });

            const ignoreUserUpdatedAt = post.ignoreUserUpdatedAt;
            const ignoreUserIdUpdatedAt = post.ignoreUserIdUpdatedAt;

            await client.post.update({
                where: { id: post.id },
                data: { userId: user.id },
            });

            const updatedPost = await client.post.findUnique({ where: { id: post.id } });

            expect(updatedPost.ignoreUserUpdatedAt.getTime()).toEqual(ignoreUserUpdatedAt.getTime());
            expect(updatedPost.ignoreUserIdUpdatedAt.getTime()).toEqual(ignoreUserIdUpdatedAt.getTime());
        });
    });
});
