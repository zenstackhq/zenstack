import {
    BinaryExpr,
    LiteralExpr,
    InvocationExpr,
    DataSource,
    DataModel,
    Function,
    AttributeArg,
    Enum,
    UnaryExpr,
    ReferenceExpr,
    ArrayExpr,
} from '../../src/language-server/generated/ast';
import { loadModel } from '../utils';

describe('Parsing Tests', () => {
    it('data source', async () => {
        const content = `
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
            }
        `;
        const doc = await loadModel(content, false);
        expect(doc.declarations).toHaveLength(1);
        const ds = doc.declarations[0] as DataSource;

        expect(ds.name).toBe('db');
        expect(ds.fields).toHaveLength(2);

        expect(ds.fields[0]).toEqual(
            expect.objectContaining({
                name: 'provider',
                value: expect.objectContaining({ value: 'postgresql' }),
            })
        );
        expect(ds.fields[1].name).toBe('url');
        expect((ds.fields[1].value as InvocationExpr).function.ref?.name).toBe(
            'env'
        );
        expect((ds.fields[1].value as InvocationExpr).args[0].value.$type).toBe(
            LiteralExpr
        );
    });

    it('enum', async () => {
        const content = `
            enum UserRole {
                USER
                ADMIN
            }

            model User {
                role UserRole @default(USER)
            }
        `;
        const doc = await loadModel(content, false);
        const enumDecl = doc.declarations[0];
        expect(enumDecl.name).toBe('UserRole');
        expect((enumDecl as Enum).fields.map((f) => f.name)).toEqual(
            expect.arrayContaining(['USER', 'ADMIN'])
        );

        const model = doc.declarations[1] as DataModel;
        expect(model.fields[0].type.reference?.ref?.name).toBe('UserRole');

        const attrVal = model.fields[0].attributes[0].args[0] as AttributeArg;
        expect((attrVal.value as ReferenceExpr).target.ref?.name).toBe('USER');
    });

    it('model field types', async () => {
        const content = `
            model User {
                id String
                age Int
                activated Boolean
                createdAt DateTime
                metadata JSON
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields).toHaveLength(5);
        expect(model.fields.map((f) => f.type.type)).toEqual(
            expect.arrayContaining([
                'String',
                'Int',
                'Boolean',
                'JSON',
                'DateTime',
            ])
        );
    });

    it('model field modifiers', async () => {
        const content = `
            model User {
                name String?
                tags String[]
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields[0].type.optional).toBeTruthy();
        expect(model.fields[1].type.array).toBeTruthy();
    });

    it('model field attributes', async () => {
        const content = `
            model User {
                id String @id
                activated Boolean @default(false) @unique
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields[0].attributes[0].decl.ref?.name).toBe('id');
        expect(model.fields[1].attributes[0].args[0].value.$type).toBe(
            LiteralExpr
        );
        expect(model.fields[1].attributes[1].decl.ref?.name).toBe('unique');
    });

    it('model attributes', async () => {
        const content = `
            model Model {
                a String
                b String
                @@unique([a, b])
                @@unique([a(sort: Asc), b])
                @@unique(b(sort: Desc))
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect(model.attributes).toHaveLength(3);
        expect(model.attributes[0].decl.ref?.name).toBe('unique');
        expect(
            (model.attributes[0].args[0].value as ArrayExpr).items.map(
                (item) => (item as ReferenceExpr).target.ref?.name
            )
        ).toEqual(expect.arrayContaining(['a', 'b']));

        expect(
            (
                (model.attributes[1].args[0].value as ArrayExpr)
                    .items[0] as ReferenceExpr
            ).args[0]
        ).toEqual(
            expect.objectContaining({
                name: 'sort',
                value: 'Asc',
            })
        );

        expect(
            (model.attributes[2].args[0].value as ReferenceExpr).target.ref
                ?.name
        ).toBe('b');
        expect(
            (model.attributes[2].args[0].value as ReferenceExpr).args[0]
        ).toEqual(
            expect.objectContaining({
                name: 'sort',
                value: 'Desc',
            })
        );
    });

    it('model relation', async () => {
        const content = `
            model User {
                id String
                posts Post[]
            }

            model Post {
                id String
                owner User @relation(references: [id], onDelete: Cascade, onUpdate: Cascade)
            }
        `;
        const doc = await loadModel(content, false);
        const models = doc.declarations as DataModel[];
        expect(models[0].fields[1].type.reference?.ref?.name === 'Post');
        expect(models[1].fields[1].type.reference?.ref?.name === 'User');
    });

    it('policy expressions', async () => {
        const content = `
            model Model {
                a Int
                b Int
                c Boolean

                @@deny('all', !c)
                @@deny('all', a < 0)
                // @@deny(a + b < 10)
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        const attrs = model.attributes;

        expect(attrs[0].args[1].value.$type).toBe(UnaryExpr);
        expect((attrs[0].args[1].value as UnaryExpr).operand.$type).toBe(
            ReferenceExpr
        );

        expect(attrs[1].args[1].value.$type).toBe(BinaryExpr);
        expect((attrs[1].args[1].value as BinaryExpr).left.$type).toBe(
            ReferenceExpr
        );
        expect((attrs[1].args[1].value as BinaryExpr).right.$type).toBe(
            LiteralExpr
        );

        expect(attrs[1].args[1].value.$type).toBe(BinaryExpr);
        expect((attrs[1].args[1].value as BinaryExpr).left.$type).toBe(
            ReferenceExpr
        );
        expect((attrs[1].args[1].value as BinaryExpr).right.$type).toBe(
            LiteralExpr
        );

        // expect(attrs[2].args[0].value.$type).toBe(BinaryExpr);
        // expect((attrs[2].args[0].value as BinaryExpr).left.$type).toBe(
        //     BinaryExpr
        // );
    });

    it('policy expression precedence', async () => {
        const content = `
            model Model {
                a Int
                b Int
                // @@deny(a + b * 2 > 0)
                // @@deny((a + b) * 2 > 0)
                @@deny('all', a > 0 && b < 0)
                @@deny('all', a >= 0 && b <= 0)
                @@deny('all', a == 0 || b != 0)
            }
        `;

        await loadModel(content, false);

        // const doc = await loadModel(content, false);
        // const attrs = (doc.declarations[0] as DataModel).attributes;

        // expect(attrs[0].args[0].value.$type).toBe(BinaryExpr);

        // // 1: a + b * 2 > 0

        // // >
        // expect((attrs[0].args[0].value as BinaryExpr).operator).toBe('>');

        // // a + b * 2
        // expect((attrs[0].args[0].value as BinaryExpr).left.$type).toBe(
        //     BinaryExpr
        // );

        // // 0
        // expect((attrs[0].args[0].value as BinaryExpr).right.$type).toBe(
        //     LiteralExpr
        // );

        // // +
        // expect(
        //     ((attrs[0].args[0].value as BinaryExpr).left as BinaryExpr).operator
        // ).toBe('+');

        // // a
        // expect(
        //     ((attrs[0].args[0].value as BinaryExpr).left as BinaryExpr).left
        //         .$type
        // ).toBe(ReferenceExpr);

        // // b * 2
        // expect(
        //     ((attrs[0].args[0].value as BinaryExpr).left as BinaryExpr).right
        //         .$type
        // ).toBe(BinaryExpr);

        // // 2: (a + b) * 2 > 0

        // // >
        // expect((attrs[1].args[0].value as BinaryExpr).operator).toBe('>');

        // // (a + b) * 2
        // expect((attrs[1].args[0].value as BinaryExpr).left.$type).toBe(
        //     BinaryExpr
        // );

        // // 0
        // expect((attrs[1].args[0].value as BinaryExpr).right.$type).toBe(
        //     LiteralExpr
        // );

        // // *
        // expect(
        //     ((attrs[1].args[0].value as BinaryExpr).left as BinaryExpr).operator
        // ).toBe('*');

        // // (a + b)
        // expect(
        //     ((attrs[1].args[0].value as BinaryExpr).left as BinaryExpr).left
        //         .$type
        // ).toBe(BinaryExpr);

        // // a
        // expect(
        //     (
        //         ((attrs[1].args[0].value as BinaryExpr).left as BinaryExpr)
        //             .left as BinaryExpr
        //     ).left.$type
        // ).toBe(ReferenceExpr);

        // // b
        // expect(
        //     (
        //         ((attrs[1].args[0].value as BinaryExpr).left as BinaryExpr)
        //             .left as BinaryExpr
        //     ).right.$type
        // ).toBe(ReferenceExpr);

        // // 2
        // expect(
        //     ((attrs[1].args[0].value as BinaryExpr).left as BinaryExpr).right
        //         .$type
        // ).toBe(LiteralExpr);
    });

    it('function', async () => {
        const content = `
            model M {
                a Int
                b Int
                c N[]
                @@deny('all', foo(a, b))
                @@deny('all', bar(c))
            }

            model N {
                x Int
            }

            function foo(a Int, b Int) Boolean {
            }

            function bar(items N[]) Boolean {
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        const foo = doc.declarations[2] as Function;
        const bar = doc.declarations[3] as Function;

        expect(foo.name).toBe('foo');
        expect(foo.params.map((p) => p.type.type)).toEqual(
            expect.arrayContaining(['Int', 'Int'])
        );

        expect(bar.name).toBe('bar');
        expect(bar.params[0].type.reference?.ref?.name).toBe('N');
        expect(bar.params[0].type.array).toBeTruthy();

        expect(model.attributes[0].args[1].value.$type).toBe(InvocationExpr);
    });

    it('member access', async () => {
        const content = `
            model M {
                a N
                @@deny('all', a.x.y < 0)
                @@deny('all', foo(a))
            }

            model N {
                x P
            }

            model P {
                y Int
            }

            function foo(n N) Boolean {
                n.x < 0
            }
        `;
        await loadModel(content, false);
    });

    it('collection predicate', async () => {
        const content = `
            model M {
                n N[]
                @@deny('all', n?[x < 0])
            }

            model N {
                x Int
            }
        `;
        await loadModel(content, false);
    });

    it('collection predicate chained', async () => {
        const content = `
            model M {
                n N[]
                @@deny('all', n?[p?[x < 0]])
            }

            model N {
                p P[]
            }

            model P {
                x Int
            }
        `;
        await loadModel(content, false);
    });
});
