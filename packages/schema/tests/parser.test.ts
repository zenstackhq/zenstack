import {
    ArrayExpr,
    BinaryExpr,
    ReferenceExpr,
    LiteralExpr,
    UnaryExpr,
    InvocationExpr,
    DataSource,
    Enum,
    DataModel,
    Function,
} from '../src/language-server/generated/ast';
import { parse } from './utils';

describe('Basic Tests', () => {
    it('data source', async () => {
        const content = `
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
            }
        `;
        const doc = await parse(content);
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
        expect(ds.fields[1]).toEqual(
            expect.objectContaining({
                name: 'url',
                value: expect.objectContaining({
                    function: 'env',
                    args: expect.arrayContaining([
                        expect.objectContaining({
                            value: 'DATABASE_URL',
                        }),
                    ]),
                }),
            })
        );
    });

    it('enum', async () => {
        const content = `
            enum UserRole {
                USER
                ADMIN
            }

            model User {
                role UserRole @default(UserRole.USER)
            }
        `;
        const doc = await parse(content);
        const enumDecl = doc.declarations[0] as Enum;
        expect(enumDecl).toEqual(
            expect.objectContaining({
                name: 'UserRole',
                fields: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'USER',
                    }),
                    expect.objectContaining({
                        name: 'ADMIN',
                    }),
                ]),
            })
        );

        const model = doc.declarations[1] as DataModel;
        expect(model.fields[0].type.reference?.ref?.name).toBe('UserRole');

        const attrVal = model.fields[0].attributes[0].args[0] as ReferenceExpr;
        expect(attrVal.$type).toBe(ReferenceExpr);
        expect(attrVal.target.ref?.name).toBe('USER');
        expect((attrVal.target.ref?.$container as Enum).name).toBe('UserRole');
    });

    it('model field types', async () => {
        const content = `
            model User {
                id String
                age Int
                salery Float
                activated Boolean
                createdAt DateTime
                metadata JSON
            }
        `;
        const doc = await parse(content);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields).toHaveLength(6);
        expect(model.fields.map((f) => f.type.type)).toEqual(
            expect.arrayContaining([
                'String',
                'Int',
                'Boolean',
                'JSON',
                'DateTime',
                'Float',
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
        const doc = await parse(content);
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
        const doc = await parse(content);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields[0].attributes[0].decl.ref?.name).toBe('id');
        expect(model.fields[1].attributes[0]).toEqual(
            expect.objectContaining({
                args: expect.arrayContaining([
                    expect.objectContaining({ value: false }),
                ]),
            })
        );
        expect(model.fields[1].attributes[1].decl.ref?.name).toBe('unique');
    });

    it('model attributes', async () => {
        const content = `
            model Model {
                a String
                b String
                @@unique([a, b])
            }
        `;
        const doc = await parse(content);
        const model = doc.declarations[0] as DataModel;
        expect(model.attributes).toHaveLength(1);
        expect(model.attributes[0].decl.ref?.name).toBe('unique');
        expect(
            (model.attributes[0].args[0] as ArrayExpr).items.map(
                (item: any) => item.target?.ref?.name
            )
        ).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('model relation', async () => {
        const content = `
            model User {
                id String
                posts Post[]
            }

            model Post {
                id String
                owner User @cascade
            }
        `;
        const doc = await parse(content);
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

                @@deny(!c)
                @@deny(a < 0)
                @@deny(a + b < 10)
            }
        `;
        const doc = await parse(content);
        const model = doc.declarations[0] as DataModel;
        const attrs = model.attributes;

        expect(attrs[0].args[0].$type).toBe(UnaryExpr);
        expect((attrs[0].args[0] as UnaryExpr).arg.$type).toBe(ReferenceExpr);

        expect(attrs[1].args[0].$type).toBe(BinaryExpr);
        expect((attrs[1].args[0] as BinaryExpr).left.$type).toBe(ReferenceExpr);
        expect((attrs[1].args[0] as BinaryExpr).right.$type).toBe(LiteralExpr);

        expect(attrs[1].args[0].$type).toBe(BinaryExpr);
        expect((attrs[1].args[0] as BinaryExpr).left.$type).toBe(ReferenceExpr);
        expect((attrs[1].args[0] as BinaryExpr).right.$type).toBe(LiteralExpr);

        expect(attrs[2].args[0].$type).toBe(BinaryExpr);
        expect((attrs[2].args[0] as BinaryExpr).left.$type).toBe(BinaryExpr);
    });

    it('policy expression precedence', async () => {
        const content = `
            model Model {
                a Int
                b Int
                @@deny(a + b * 2 > 0)
                @@deny((a + b) * 2 > 0)
                @@deny(a > 0 && b < 0)
                @@deny(a >= 0 && b <= 0)
                @@deny(a == 0 || b != 0)
            }
        `;
        const doc = await parse(content);
        const attrs = (doc.declarations[0] as DataModel).attributes;

        expect(attrs[0].args[0].$type).toBe(BinaryExpr);

        // 1: a + b * 2 > 0

        // >
        expect((attrs[0].args[0] as BinaryExpr).operator).toBe('>');

        // a + b * 2
        expect((attrs[0].args[0] as BinaryExpr).left.$type).toBe(BinaryExpr);

        // 0
        expect((attrs[0].args[0] as BinaryExpr).right.$type).toBe(LiteralExpr);

        // +
        expect(
            ((attrs[0].args[0] as BinaryExpr).left as BinaryExpr).operator
        ).toBe('+');

        // a
        expect(
            ((attrs[0].args[0] as BinaryExpr).left as BinaryExpr).left.$type
        ).toBe(ReferenceExpr);

        // b * 2
        expect(
            ((attrs[0].args[0] as BinaryExpr).left as BinaryExpr).right.$type
        ).toBe(BinaryExpr);

        // 2: (a + b) * 2 > 0

        // >
        expect((attrs[1].args[0] as BinaryExpr).operator).toBe('>');

        // (a + b) * 2
        expect((attrs[1].args[0] as BinaryExpr).left.$type).toBe(BinaryExpr);

        // 0
        expect((attrs[1].args[0] as BinaryExpr).right.$type).toBe(LiteralExpr);

        // *
        expect(
            ((attrs[1].args[0] as BinaryExpr).left as BinaryExpr).operator
        ).toBe('*');

        // (a + b)
        expect(
            ((attrs[1].args[0] as BinaryExpr).left as BinaryExpr).left.$type
        ).toBe(BinaryExpr);

        // a
        expect(
            (
                ((attrs[1].args[0] as BinaryExpr).left as BinaryExpr)
                    .left as BinaryExpr
            ).left.$type
        ).toBe(ReferenceExpr);

        // b
        expect(
            (
                ((attrs[1].args[0] as BinaryExpr).left as BinaryExpr)
                    .left as BinaryExpr
            ).right.$type
        ).toBe(ReferenceExpr);

        // 2
        expect(
            ((attrs[1].args[0] as BinaryExpr).left as BinaryExpr).right.$type
        ).toBe(LiteralExpr);
    });

    it('function', async () => {
        const content = `
            model M {
                a Int
                b Int
                c N[]
                @@deny(foo(a, b))
                @@deny(bar(c))
            }

            model N {
                x Int
            }

            function foo(a Int, b Int) {
                a > b
            }

            function bar(items N[]) {
                true
            }
        `;
        const doc = await parse(content);
        const model = doc.declarations[0] as DataModel;
        const foo = doc.declarations[2] as Function;
        const bar = doc.declarations[3] as Function;

        expect(foo.name).toBe('foo');
        expect(foo.params.map((p) => p.type.type)).toEqual(
            expect.arrayContaining(['Int', 'Int'])
        );
        expect(foo.expression.$type).toBe(BinaryExpr);

        expect(bar.name).toBe('bar');
        expect(bar.params[0].type.reference?.ref?.name).toBe('N');
        expect(bar.params[0].type.array).toBeTruthy();

        expect(model.attributes[0].args[0].$type).toBe(InvocationExpr);
    });

    it('member access', async () => {
        const content = `
            model M {
                a N
                @@deny(a.x < 0)
                @@deny(foo(a))
            }

            model N {
                x Int
            }

            function foo(n N) {
                n.x < 0
            }
        `;
        const doc = await parse(content);
        const model = doc.declarations[0] as DataModel;
        const foo = doc.declarations[2] as Function;
        const bar = doc.declarations[3] as Function;

        expect(foo.name).toBe('foo');
        expect(foo.params.map((p) => p.type.type)).toEqual(
            expect.arrayContaining(['Int', 'Int'])
        );
        expect(foo.expression.$type).toBe(BinaryExpr);

        expect(bar.name).toBe('bar');
        expect(bar.params[0].type.reference?.ref?.name).toBe('N');
        expect(bar.params[0].type.array).toBeTruthy();

        expect(model.attributes[0].args[0].$type).toBe(InvocationExpr);
    });

    // it('feature coverage', async () => {
    //     const content = `
    //         datasource {
    //             provider = 'postgresql'
    //             url = env('DATABASE_URL')
    //         }

    //         fragment CommonFields {
    //             id String @id
    //             createdBy User @createdBy
    //             updatedBy User @updatedBy
    //             createdAt DateTime @createdAt
    //             updatedAt DateTime @updatedAt
    //         }

    //         model Space
    //         @deny('all', auth() == null)
    //         @allow('create', true)
    //         @allow('read', userInSpace(auth(), $this))
    //         @allow('update,delete', userIsSpaceAdmin(auth(), $this)) {
    //             ...CommonFields
    //             name String
    //             slug String @unique
    //             members SpaceUser[] @cascade
    //             todoLists TodoList[] @cascade
    //         }

    //         enum SpaceUserRole {
    //             USER
    //             ADMIN
    //         }

    //         model SpaceUser
    //         @deny('all', auth() == null)
    //         @allow('create,update,delete', userIsSpaceAdmin(auth(), $this.space))
    //         @allow('read', userInSpace(auth(), $this.space)) {
    //             ...CommonFields
    //             space Space
    //             user User
    //             role SpaceUserRole
    //         }

    //         model User
    //         @deny('all', auth() == null)
    //         @allow('create', true)
    //         @allow('read', userInAnySpace(auth(), spaces))
    //         @allow('update,delete', auth() == $this) {
    //             ...CommonFields
    //             email String @unique
    //             name String?
    //             todoList TodoList[]
    //             spaces SpaceUser[] @cascade
    //             profile Profile? @cascade
    //         }

    //         model Profile
    //         @deny('all', auth() == null)
    //         @allow('read', userInAnySpace(auth(), $this.user.spaces))
    //         @allow('create,update,delete', $this.user == auth()) {
    //             ...CommonFields
    //             user User @unique
    //             avatar String?
    //         }

    //         model TodoList
    //         @deny('all', auth() == null)
    //         @allow('read', $this.owner == auth() || (userInSpace(auth(), $this.space) && !$this.private))
    //         @allow('create,update,delete', $this.owner == auth() && userInSpace(auth(), $this.space)) {
    //             ...CommonFields
    //             space Space
    //             owner User
    //             title String
    //             content String
    //             private Boolean @default(true)
    //             todos Todo[] @cascade
    //         }

    //         model Todo
    //         @deny('all', auth() == null)
    //         @allow('all', $this.todoList.owner == auth() || (userInSpace(auth(), $this.todoList.space) && !$this.todoList.private)) {
    //             ...CommonFields
    //             owner User
    //             todoList TodoList
    //             title String
    //             completedAt DateTime?
    //         }

    //         function userInSpace(user, space) {
    //             exists(SpaceUser, $.space == space && $.user == user)
    //         }

    //         function userIsSpaceAdmin(user, space) {
    //             exists(SpaceUser, $.space == space && $.user == user && $.role == ADMIN)
    //         }

    //         function userInAnySpace(user, spaces) {
    //             find(spaces, $.user == user)
    //         }
    //     `;

    //     const model = await parse(content);

    //     console.log('Dump AST:', model);
    // });
});
