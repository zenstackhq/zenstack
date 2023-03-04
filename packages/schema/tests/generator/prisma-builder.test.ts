import { getDMMF } from '@prisma/internals';
import {
    AttributeArg,
    AttributeArgValue,
    DataSourceUrl,
    FieldAttribute,
    FieldReference,
    FieldReferenceArg,
    FunctionCall,
    FunctionCallArg,
    ModelFieldType,
    PrismaModel,
} from '../../src/plugins/prisma/prisma-builder';

async function validate(model: PrismaModel) {
    const content = model.toString();
    try {
        return await getDMMF({ datamodel: content });
    } catch (err) {
        console.error(`Failed to load DMMF: ${err}`);
        throw err;
    }
}

describe('Prisma Builder Tests', () => {
    it('datasource', async () => {
        let model = new PrismaModel();
        model.addDataSource('db', 'postgresql', new DataSourceUrl('DATABASE_URL', true));
        await validate(model);

        model = new PrismaModel();
        model.addDataSource(
            'db',
            'postgresql',
            new DataSourceUrl('postgresql://postgres:abc123@localhost:5432/sample?schema=public', false)
        );
        await validate(model);
    });

    it('enum', async () => {
        const model = new PrismaModel();
        const _enum = model.addEnum('UserRole');
        _enum.addField('USER');
        _enum.addField('ADMIN');
        await validate(model);
    });

    it('generator', async () => {
        const model = new PrismaModel();
        model.addGenerator('client', [{ name: 'provider', value: 'prisma-client-js' }]);
        await validate(model);
    });

    it('model', async () => {
        const model = new PrismaModel();
        const dm = model.addModel('User');
        dm.addField('id', 'String', [new FieldAttribute('@id')]);
        dm.addField('createdAt', 'DateTime', [
            new FieldAttribute('@default', [
                new AttributeArg(undefined, new AttributeArgValue('FunctionCall', new FunctionCall('now'))),
            ]),
        ]);
        await validate(model);
    });

    it('relation', async () => {
        const model = new PrismaModel();
        const user = model.addModel('User');
        user.addField('id', 'String', [new FieldAttribute('@id')]);
        user.addField('posts', new ModelFieldType('Post', true));

        const post = model.addModel('Post');
        post.addField('id', 'String', [new FieldAttribute('@id')]);
        post.addField('user', 'User', [
            new FieldAttribute('@relation', [
                new AttributeArg(
                    'fields',
                    new AttributeArgValue('Array', [new AttributeArgValue('FieldReference', 'userId')])
                ),
                new AttributeArg(
                    'references',
                    new AttributeArgValue('Array', [new AttributeArgValue('FieldReference', 'id')])
                ),
                new AttributeArg('onDelete', new AttributeArgValue('FieldReference', new FieldReference('Cascade'))),
            ]),
        ]);
        post.addField('userId', 'String');

        await validate(model);
    });

    it('model attribute', async () => {
        const model = new PrismaModel();
        const post = model.addModel('Post');
        post.addField('id', 'String', [new FieldAttribute('@id')]);
        post.addField('slug', 'String');
        post.addField('space', 'String');
        post.addField('tsid', 'String', [
            new FieldAttribute('@default', [
                new AttributeArg(
                    undefined,
                    new AttributeArgValue(
                        'FunctionCall',
                        new FunctionCall('dbgenerated', [new FunctionCallArg(undefined, 'timestamp_id()')])
                    )
                ),
            ]),
        ]);
        post.addAttribute('@@unique', [
            new AttributeArg(
                'fields',
                new AttributeArgValue('Array', [
                    new AttributeArgValue('FieldReference', new FieldReference('space')),
                    new AttributeArgValue(
                        'FieldReference',
                        new FieldReference('slug', [new FieldReferenceArg('sort', 'Desc')])
                    ),
                ])
            ),
        ]);

        await validate(model);
    });
});
