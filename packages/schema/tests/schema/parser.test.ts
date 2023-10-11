/* eslint-disable @typescript-eslint/ban-types */
/// <reference types="@types/jest" />

import {
    ArrayExpr,
    AttributeArg,
    BinaryExpr,
    BooleanLiteral,
    ConfigArrayExpr,
    ConfigInvocationArg,
    ConfigInvocationExpr,
    DataModel,
    DataSource,
    Enum,
    FunctionDecl,
    InvocationExpr,
    MemberAccessExpr,
    NumberLiteral,
    ReferenceExpr,
    StringLiteral,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { loadModel } from '@zenstackhq/testtools';

describe('Parsing Tests', () => {
    it('data source', async () => {
        const content = `
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
                directUrl = env('DATABASE_URL')
                extensions = [pg_trgm, postgis(version: "3.3.2"), uuid_ossp(map: "uuid-ossp", schema: "extensions")]
                schemas    = ["auth", "public"]
            }
        `;
        const doc = await loadModel(content, false);
        expect(doc.declarations).toHaveLength(1);
        const ds = doc.declarations[0] as DataSource;

        expect(ds.name).toBe('db');
        expect(ds.fields).toHaveLength(5);

        expect(ds.fields[0]).toEqual(
            expect.objectContaining({
                name: 'provider',
                value: expect.objectContaining({ value: 'postgresql' }),
            })
        );
        expect(ds.fields[1].name).toBe('url');
        expect((ds.fields[1].value as InvocationExpr).function.ref?.name).toBe('env');
        expect((ds.fields[1].value as InvocationExpr).args[0].value.$type).toBe(StringLiteral);

        expect((ds.fields[3].value as ConfigArrayExpr).items[0].$type).toBe(ConfigInvocationExpr);
        expect(
            (((ds.fields[3].value as ConfigArrayExpr).items[1] as ConfigInvocationExpr).args[0] as ConfigInvocationArg)
                .name
        ).toBe('version');
        expect(
            (((ds.fields[3].value as ConfigArrayExpr).items[1] as ConfigInvocationExpr).args[0] as ConfigInvocationArg)
                .value.$type
        ).toBe(StringLiteral);

        expect((ds.fields[4].value as ConfigArrayExpr).items[0].$type).toBe(StringLiteral);
    });

    it('enum simple', async () => {
        const content = `
            enum UserRole {
                USER
                ADMIN
            }

            model User {
                id String @id
                role UserRole @default(USER)
            }
        `;
        const doc = await loadModel(content, false);
        const enumDecl = doc.declarations[0];
        expect(enumDecl.name).toBe('UserRole');
        expect((enumDecl as Enum).fields.map((f) => f.name)).toEqual(expect.arrayContaining(['USER', 'ADMIN']));

        const model = doc.declarations[1] as DataModel;
        expect(model.fields[1].type.reference?.ref?.name).toBe('UserRole');

        const attrVal = model.fields[1].attributes[0].args[0] as AttributeArg;
        expect((attrVal.value as ReferenceExpr).target.ref?.name).toBe('USER');
    });

    it('enum dup name resolve', async () => {
        const content = `
            datasource db {
                provider = "postgresql"
                url      = env("DATABASE_URL")
            }
            
            enum FirstEnum {
                E1 // used in both ENUMs
                E2
            }
            
            enum SecondEnum  {
                E1 // used in both ENUMs
                E3
                E4
            }
            
            model M {
                id Int @id
                first  SecondEnum @default(E1)
                second FirstEnum @default(E1)
            }        
            `;

        const doc = await loadModel(content);
        const firstEnum = doc.declarations.find((d) => d.name === 'FirstEnum');
        const secondEnum = doc.declarations.find((d) => d.name === 'SecondEnum');
        const m = doc.declarations.find((d) => d.name === 'M') as DataModel;
        expect(m.fields[1].attributes[0].args[0].value.$resolvedType?.decl).toBe(secondEnum);
        expect(m.fields[2].attributes[0].args[0].value.$resolvedType?.decl).toBe(firstEnum);
    });

    it('string escape', async () => {
        const content = `
            model Example {
                id Int @id
                doubleQuote String @default("s\\"1")
                singleQuote String @default('s\\'1')
                json Json @default("{\\"theme\\": \\"light\\", \\"consoleDrawer\\": false}")
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect((model.fields[1].attributes[0].args[0].value as StringLiteral).value).toBe('s"1');
        expect((model.fields[2].attributes[0].args[0].value as StringLiteral).value).toBe("s'1");
        expect((model.fields[3].attributes[0].args[0].value as StringLiteral).value).toBe(
            '{"theme": "light", "consoleDrawer": false}'
        );
    });

    it('model field types', async () => {
        const content = `
            model User {
                id String @id
                age Int
                serial BigInt
                height Float
                salary Decimal
                activated Boolean
                createdAt DateTime
                metadata Json
                content Bytes
                unsupported Unsupported('foo')
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields.map((f) => f.type.type)).toEqual(
            expect.arrayContaining([
                'String',
                'Int',
                'BigInt',
                'Float',
                'Decimal',
                'Boolean',
                'Json',
                'DateTime',
                'Bytes',
            ])
        );
        expect(model.fields.find((f) => f.name === 'unsupported')?.type.unsupported?.value.value).toBe('foo');
    });

    it('model field modifiers', async () => {
        const content = `
            model User {
                id String @id
                name String?
                tags String[]
                tagsWithDefault String[] @default([])
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        expect(model.fields[1].type.optional).toBeTruthy();
        expect(model.fields[2].type.array).toBeTruthy();
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
        expect(model.fields[0].attributes[0].decl.ref?.name).toBe('@id');
        expect(model.fields[1].attributes[0].args[0].value.$type).toBe(BooleanLiteral);
        expect(model.fields[1].attributes[1].decl.ref?.name).toBe('@unique');
    });

    it('model attributes', async () => {
        const content = `
            model Model {
                id String @id
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
        expect(model.attributes[0].decl.ref?.name).toBe('@@unique');
        expect(
            (model.attributes[0].args[0].value as ArrayExpr).items.map(
                (item) => (item as ReferenceExpr).target.ref?.name
            )
        ).toEqual(expect.arrayContaining(['a', 'b']));

        expect(((model.attributes[1].args[0].value as ArrayExpr).items[0] as ReferenceExpr).args[0]).toEqual(
            expect.objectContaining({
                name: 'sort',
                value: 'Asc',
            })
        );

        expect((model.attributes[2].args[0].value as ReferenceExpr).target.ref?.name).toBe('b');
        expect((model.attributes[2].args[0].value as ReferenceExpr).args[0]).toEqual(
            expect.objectContaining({
                name: 'sort',
                value: 'Desc',
            })
        );
    });

    it('model relation', async () => {
        const content = `
            model User {
                id String @id
                posts Post[]
            }

            model Post {
                id String @id
                owner User @relation(references: [id], onDelete: Cascade, onUpdate: Cascade)
            }
        `;
        const doc = await loadModel(content, false);
        const models = doc.declarations as DataModel[];
        expect(models[0].fields[1].type.reference?.ref?.name).toBe('Post');
        expect(models[1].fields[1].type.reference?.ref?.name).toBe('User');
    });

    it('policy expressions', async () => {
        const content = `
            model Model {
                id String @id
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
        expect((attrs[0].args[1].value as UnaryExpr).operand.$type).toBe(ReferenceExpr);

        expect(attrs[1].args[1].value.$type).toBe(BinaryExpr);
        expect((attrs[1].args[1].value as BinaryExpr).left.$type).toBe(ReferenceExpr);
        expect((attrs[1].args[1].value as BinaryExpr).right.$type).toBe(NumberLiteral);

        // expect(attrs[2].args[0].value.$type).toBe(BinaryExpr);
        // expect((attrs[2].args[0].value as BinaryExpr).left.$type).toBe(
        //     BinaryExpr
        // );
    });

    it('expression precedence and associativity', async () => {
        const content = `
            model Model {
                id String @id
                a Int
                b Int
                c Boolean
                foo Foo?
                // @@deny(a + b * 2 > 0)
                // @@deny((a + b) * 2 > 0)
                @@deny('all', a > 0 && b < 0)
                @@deny('all', a >= 0 && b <= 0)
                @@deny('all', a == 0 || b != 0)
                @@deny('all', !c || a > 0)
                @@deny('all', !(c || a > 0))
                @@deny('all', !foo.x)
            }

            model Foo {
                id String @id
                x Boolean
                modelId String
                model Model @relation(references: [id], fields: [modelId])
            }
        `;

        await loadModel(content, false);

        const doc = await loadModel(content, false);
        const attrs = (doc.declarations[0] as DataModel).attributes;

        // a > 0 && b < 0
        let arg = attrs[0].args[1].value;
        expect(arg.$type).toBe(BinaryExpr);
        expect((arg as BinaryExpr).operator).toBe('&&');
        expect((arg as BinaryExpr).left.$type).toBe(BinaryExpr);
        expect(((arg as BinaryExpr).left as BinaryExpr).operator).toBe('>');

        // a >= 0 && b <= 0
        arg = attrs[1].args[1].value;
        expect(arg.$type).toBe(BinaryExpr);
        expect((arg as BinaryExpr).operator).toBe('&&');
        expect((arg as BinaryExpr).left.$type).toBe(BinaryExpr);
        expect(((arg as BinaryExpr).left as BinaryExpr).operator).toBe('>=');

        // a == 0 || b != 0
        arg = attrs[2].args[1].value;
        expect(arg.$type).toBe(BinaryExpr);
        expect((arg as BinaryExpr).operator).toBe('||');
        expect((arg as BinaryExpr).left.$type).toBe(BinaryExpr);
        expect(((arg as BinaryExpr).left as BinaryExpr).operator).toBe('==');

        // !c || a > 0
        arg = attrs[3].args[1].value;
        expect(arg.$type).toBe(BinaryExpr);
        expect((arg as BinaryExpr).operator).toBe('||');
        expect((arg as BinaryExpr).left.$type).toBe(UnaryExpr);
        expect(((arg as BinaryExpr).left as UnaryExpr).operator).toBe('!');

        // !(c || a > 0)
        arg = attrs[4].args[1].value;
        expect(arg.$type).toBe(UnaryExpr);
        expect((arg as UnaryExpr).operator).toBe('!');

        // !foo.x
        arg = attrs[5].args[1].value;
        expect(arg.$type).toBe(UnaryExpr);
        expect((arg as UnaryExpr).operator).toBe('!');
        expect((arg as UnaryExpr).operand.$type).toBe(MemberAccessExpr);

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
                id String @id
                a Int
                b Int
                c N[]
                @@deny('all', foo(a, b))
                @@deny('all', bar(c))
            }

            model N {
                id String @id
                x Int
            }

            function foo(a: Int, b: Int): Boolean {
            }

            function bar(items: N[]): Boolean {
            }
        `;
        const doc = await loadModel(content, false);
        const model = doc.declarations[0] as DataModel;
        const foo = doc.declarations[2] as FunctionDecl;
        const bar = doc.declarations[3] as FunctionDecl;

        expect(foo.name).toBe('foo');
        expect(foo.params.map((p) => p.type.type)).toEqual(expect.arrayContaining(['Int', 'Int']));

        expect(bar.name).toBe('bar');
        expect(bar.params[0].type.reference?.ref?.name).toBe('N');
        expect(bar.params[0].type.array).toBeTruthy();

        expect(model.attributes[0].args[1].value.$type).toBe(InvocationExpr);
    });

    it('member access', async () => {
        const content = `
            model M {
                id String @id
                a N
                @@deny('all', a.x.y < 0)
                @@deny('all', foo(a))
            }

            model N {
                id String @id
                x P
            }

            model P {
                id String @id
                y Int
            }

            function foo(n: N): Boolean {
                n.x < 0
            }
        `;
        await loadModel(content, false);
    });

    it('collection predicate', async () => {
        const content = `
            model M {
                id String @id
                n N[]
                @@deny('all', n?[x < 0])
            }

            model N {
                id String @id
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

    it('boolean prefix id', async () => {
        const content = `   
            model trueModel {
                id String @id
                isPublic Boolean @default(false)
                trueText String? 
                falseText String?
                @@allow('all', isPublic == true)
            }
                `;
        await loadModel(content, false);
    });

    it('view support', async () => {
        const content = `   
            view UserInfo {
                id    Int    @unique
                email String
                name  String
                bio   String
            }
                `;
        const doc = await loadModel(content, false);
        expect((doc.declarations[0] as DataModel).isView).toBeTruthy();
    });
});
