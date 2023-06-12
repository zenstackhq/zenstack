import { loadSchema } from '@zenstackhq/testtools';

describe('Misc Function Coverage Tests', () => {
    it('now() function', async () => {
        const { withPresets } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                dt DateTime @default(now())
                @@allow('create,read', true)
                @@allow('update', now() >= dt && future().dt > now())
            }
            `
        );

        const db = withPresets();
        const now = new Date();

        await db.foo.create({ data: { id: '1', dt: new Date(now.getTime() + 1000) } });
        // violates `dt <= now()`
        await expect(db.foo.update({ where: { id: '1' }, data: { dt: now } })).toBeRejectedByPolicy();

        await db.foo.create({ data: { id: '2', dt: now } });
        // violates `future().dt > now()`
        await expect(db.foo.update({ where: { id: '2' }, data: { dt: now } })).toBeRejectedByPolicy();

        // success
        await expect(
            db.foo.update({ where: { id: '2' }, data: { dt: new Date(now.getTime() + 1000) } })
        ).toResolveTruthy();
        expect(await db.foo.findUnique({ where: { id: '2' } })).toMatchObject({ dt: new Date(now.getTime() + 1000) });
    });
});
