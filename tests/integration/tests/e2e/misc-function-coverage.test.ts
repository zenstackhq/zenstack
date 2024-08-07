import { loadSchema } from '@zenstackhq/testtools';
import { validate, version } from 'uuid';

describe('Misc Function Coverage Tests', () => {
    it('now() function', async () => {
        const { enhance } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                dt DateTime @default(now())
                @@allow('create,read', true)
                @@allow('update', now() >= dt && future().dt > now())
            }
            `
        );

        const db = enhance();
        const now = new Date();

        await db.foo.create({ data: { id: '1', dt: new Date(now.getTime() + 1000) } });
        // violates `dt <= now()`
        await expect(db.foo.update({ where: { id: '1' }, data: { dt: now } })).toBeRejectedByPolicy();

        await db.foo.create({ data: { id: '2', dt: now } });
        // violates `future().dt > now()`
        await expect(db.foo.update({ where: { id: '2' }, data: { dt: now } })).toBeRejectedByPolicy();

        // success
        await expect(
            db.foo.update({ where: { id: '2' }, data: { dt: new Date(now.getTime() + 10000) } })
        ).toResolveTruthy();
        expect(await db.foo.findUnique({ where: { id: '2' } })).toMatchObject({ dt: new Date(now.getTime() + 10000) });
    });

    it('uuid() function', async () => {
        const { enhance } = await loadSchema(
            `
            model Foo {
                id String @id @default(uuid())
                id4 String @default(uuid(4))
                id7 String @default(uuid(7))

                @@allow('all', true)
            }
            `
        );

        const db = enhance();
        const foo = await db.foo.create({ data: {} });
        expect(validate(foo.id)).toBeTruthy();
        expect(version(foo.id)).toBe(4);
        expect(validate(foo.id4)).toBeTruthy();
        expect(version(foo.id4)).toBe(4);
        expect(validate(foo.id7)).toBeTruthy();
        expect(version(foo.id7)).toBe(7);
    });
});
