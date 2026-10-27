import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/1211
describe('Regression for issue 1211', () => {
    const ENUM = `
enum PostStatus {
    DRAFT     @map('draft')
    ACTIVE    @map('active')
    CANCELLED @map('cancelled')
}
`;

    it('validates enum-typed field against an enum with @map-ed values', async () => {
        const db = await createTestClient(`
${ENUM}
model Post {
    id     Int        @id @default(autoincrement())
    status PostStatus
    @@validate(status in PostStatus)
}
`);
        await expect(db.post.create({ data: { status: 'DRAFT' } })).resolves.toMatchObject({ status: 'DRAFT' });
    });

    it('validates string field against an enum', async () => {
        const db = await createTestClient(`
enum PostStatus {
    DRAFT
    ACTIVE
}
model Post {
    id     Int    @id @default(autoincrement())
    status String
    @@validate(status in PostStatus)
}
`);
        await expect(db.post.create({ data: { status: 'ACTIVE' } })).resolves.toMatchObject({ status: 'ACTIVE' });
        await expect(db.post.create({ data: { status: 'UNKNOWN' } })).toBeRejectedByValidation();
    });

    it('checks enum-typed field against an enum with @map-ed values in policies', async () => {
        const db = await createPolicyTestClient(`
${ENUM}
model Post {
    id     Int        @id @default(autoincrement())
    status PostStatus
    @@allow('create', true)
    @@allow('read', status in PostStatus)
}
`);
        await db.$unuseAll().post.create({ data: { status: 'DRAFT' } });
        await expect(db.post.findMany()).resolves.toMatchObject([{ status: 'DRAFT' }]);
    });

    it('checks enum-typed field against an explicit enum array with @map-ed values in policies', async () => {
        const db = await createPolicyTestClient(`
${ENUM}
model Post {
    id     Int        @id @default(autoincrement())
    status PostStatus
    @@allow('create', true)
    @@allow('read', status in [DRAFT, ACTIVE])
}
`);
        await db.$unuseAll().post.create({ data: { status: 'DRAFT' } });
        await db.$unuseAll().post.create({ data: { status: 'CANCELLED' } });
        await expect(db.post.findMany()).resolves.toMatchObject([{ status: 'DRAFT' }]);
    });

    it('checks auth() enum member against an enum with @map-ed values in policies', async () => {
        const db = await createPolicyTestClient(`
${ENUM}
model User {
    id     Int        @id @default(autoincrement())
    status PostStatus
    @@allow('all', true)
}
model Post {
    id Int @id @default(autoincrement())
    @@allow('create', true)
    @@allow('read', auth().status in PostStatus)
}
`);
        await db.$unuseAll().post.create({ data: {} });
        await expect(db.$setAuth({ id: 1, status: 'DRAFT' }).post.findMany()).resolves.toHaveLength(1);
        await expect(db.$setAuth({ id: 1, status: 'UNKNOWN' }).post.findMany()).resolves.toHaveLength(0);
    });
});
