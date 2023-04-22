import { loadSchema } from '@zenstackhq/testtools';

describe('Filter Function Coverage Tests', () => {
    it('contains case-sensitive', async () => {
        const { withPresets } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', contains(string, 'a'))
            }
            `
        );

        await expect(withPresets().foo.create({ data: { string: 'bcd' } })).toBeRejectedByPolicy();
        await expect(withPresets().foo.create({ data: { string: 'bac' } })).toResolveTruthy();
    });

    it('startsWith', async () => {
        const { withPresets } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', startsWith(string, 'a'))
            }
            `
        );

        await expect(withPresets().foo.create({ data: { string: 'bac' } })).toBeRejectedByPolicy();
        await expect(withPresets().foo.create({ data: { string: 'abc' } })).toResolveTruthy();
    });

    it('endsWith', async () => {
        const { withPresets } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', endsWith(string, 'a'))
            }
            `
        );

        await expect(withPresets().foo.create({ data: { string: 'bac' } })).toBeRejectedByPolicy();
        await expect(withPresets().foo.create({ data: { string: 'bca' } })).toResolveTruthy();
    });

    it('in', async () => {
        const { withPresets } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', string in ['a', 'b'])
            }
            `
        );

        await expect(withPresets().foo.create({ data: { string: 'c' } })).toBeRejectedByPolicy();
        await expect(withPresets().foo.create({ data: { string: 'b' } })).toResolveTruthy();
    });
});
