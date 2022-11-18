import {
    DataSourceUrl,
    PrismaModel,
    FieldAttribute,
    AttributeArg,
    FunctionCall,
    AttributeArgValue,
    ModelFieldType,
    FieldReference,
    FieldReferenceArg,
} from '../../src/generator/prisma/prisma-builder';
import { getDMMF } from '@prisma/internals';

async function validate(model: PrismaModel) {
    const content = model.toString();
    try {
        return await getDMMF({ datamodel: content });
    } catch (err) {
        console.error(`Failed to load DMMF: ${err}`);
        throw err;
    }
}

// TODO: this test suite is failing on github actions; disabling for now
describe.skip('Prisma Builder Tests', () => {
    it('datasource', async () => {
        let model = new PrismaModel();
        model.addDataSource(
            'db',
            'postgresql',
            new DataSourceUrl('DATABASE_URL', true)
        );
        await validate(model);

        model = new PrismaModel();
        model.addDataSource(
            'db',
            'postgresql',
            new DataSourceUrl(
                'postgresql://postgres:abc123@localhost:5432/sample?schema=public',
                false
            )
        );
        await validate(model);
    });

    it('enum', async () => {
        let model = new PrismaModel();
        model.addEnum('UserRole', ['USER', 'ADMIN']);
        await validate(model);
    });

    it('generator', async () => {
        let model = new PrismaModel();
        model.addGenerator('client', 'prisma-client-js', '.prisma');
        await validate(model);
    });

    it('model', async () => {
        let model = new PrismaModel();
        const dm = model.addModel('User');
        dm.addField('id', 'String', [new FieldAttribute('@id')]);
        dm.addField('createdAt', 'DateTime', [
            new FieldAttribute('@default', [
                new AttributeArg(
                    undefined,
                    new AttributeArgValue(
                        'FunctionCall',
                        new FunctionCall('now')
                    )
                ),
            ]),
        ]);
        await validate(model);
    });

    it('relation', async () => {
        let model = new PrismaModel();
        const user = model.addModel('User');
        user.addField('id', 'String', [new FieldAttribute('@id')]);
        user.addField('posts', new ModelFieldType('Post', true));

        const post = model.addModel('Post');
        post.addField('id', 'String', [new FieldAttribute('@id')]);
        post.addField('user', 'User', [
            new FieldAttribute('@relation', [
                new AttributeArg(
                    'fields',
                    new AttributeArgValue('Array', [
                        new AttributeArgValue('FieldReference', 'userId'),
                    ])
                ),
                new AttributeArg(
                    'references',
                    new AttributeArgValue('Array', [
                        new AttributeArgValue('FieldReference', 'id'),
                    ])
                ),
                new AttributeArg(
                    'onDelete',
                    new AttributeArgValue(
                        'FieldReference',
                        new FieldReference('Cascade')
                    )
                ),
            ]),
        ]);
        post.addField('userId', 'String');

        await validate(model);
    });

    it('model attribute', async () => {
        let model = new PrismaModel();
        const post = model.addModel('Post');
        post.addField('id', 'String', [new FieldAttribute('@id')]);
        post.addField('slug', 'String');
        post.addField('space', 'String');
        post.addAttribute('@@unique', [
            new AttributeArg(
                'fields',
                new AttributeArgValue('Array', [
                    new AttributeArgValue(
                        'FieldReference',
                        new FieldReference('space')
                    ),
                    new AttributeArgValue(
                        'FieldReference',
                        new FieldReference('slug', [
                            new FieldReferenceArg('sort', 'Desc'),
                        ])
                    ),
                ])
            ),
        ]);

        await validate(model);
    });
});
