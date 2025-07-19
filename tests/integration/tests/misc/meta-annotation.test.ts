import { loadSchema } from '@zenstackhq/testtools';

describe('`@@meta` attribute tests', () => {
    it('generates generated into model-meta', async () => {
        const { modelMeta } = await loadSchema(
            `
            model User {
                id Int @id
                name String @meta('private', true) @meta('level', 1)

                @@meta(name: 'doc', value: 'It is user model')
                @@meta('info', { description: 'This is a user model', geo: { country: 'US' } })
            }
            `
        );

        const model = modelMeta.models.user;
        const userModelMeta = model.attributes.filter((attr: any) => attr.name === '@@meta');
        expect(userModelMeta).toEqual(
            expect.arrayContaining([
                {
                    name: '@@meta',
                    args: expect.arrayContaining([
                        { name: 'name', value: 'doc' },
                        { name: 'value', value: 'It is user model' },
                    ]),
                },
                {
                    name: '@@meta',
                    args: expect.arrayContaining([
                        { name: 'name', value: 'info' },
                        { name: 'value', value: { description: 'This is a user model', geo: { country: 'US' } } },
                    ]),
                },
            ])
        );

        const field = model.fields.name;
        const fieldMeta = field.attributes.filter((attr: any) => attr.name === '@meta');
        expect(fieldMeta).toEqual(
            expect.arrayContaining([
                {
                    name: '@meta',
                    args: expect.arrayContaining([
                        { name: 'name', value: 'private' },
                        { name: 'value', value: true },
                    ]),
                },
                {
                    name: '@meta',
                    args: expect.arrayContaining([
                        { name: 'name', value: 'level' },
                        { name: 'value', value: 1 },
                    ]),
                },
            ])
        );
    });
});
