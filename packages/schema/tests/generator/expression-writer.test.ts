/// <reference types="@types/jest" />

import { DataModel, Enum, Expression, isDataModel, isEnum } from '@zenstackhq/language/ast';
import * as tmp from 'tmp';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { ExpressionWriter } from '../../src/plugins/enhancer/policy/expression-writer';
import { loadModel } from '../utils';

tmp.setGracefulCleanup();

describe('Expression Writer Tests', () => {
    it('boolean literal', async () => {
        await check(
            `
            model Test {
                id String @id
                @@allow('all', true)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ AND: [] }`
        );

        await check(
            `
            model Test {
                id String @id
                @@allow('all', false)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ OR: [] }`
        );
    });

    it('boolean field', async () => {
        await check(
            `
            model Test {
                id String @id
                flag Boolean
                @@allow('all', flag)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ flag: true }`
        );

        await check(
            `
            model Test {
                id String @id
                flag Boolean
                @@allow('all', !flag)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ NOT: { flag: true } }`
        );
    });

    it('enum', async () => {
        await check(
            `
            enum Role {
                USER
                ADMIN
            }

            model Test {
                id String @id
                role Role
                @@allow('all', role == ADMIN)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ role: { equals: Role.ADMIN } }`
        );
    });

    it('field against literal', async () => {
        await check(
            `
            model Test {
                id String @id
                x Int
                @@allow('all', x > 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                x: {
                    gt: 0
                }
            }`
        );

        await check(
            `
            model Test {
                id String @id
                label String
                @@allow('all', label == 'thing')
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                label: {
                    equals: 'thing'
                }
            }`
        );
    });

    it('this reference', async () => {
        await check(
            `
            model Test {
                id String @id
                @@allow('all', this == this)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{OR:[]}`
        );

        await check(
            `
            model Test {
                id String @id
                x Int
                @@allow('all', this.x > 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                x: {
                    gt: 0
                }
            }`
        );
    });

    it('logical', async () => {
        await check(
            `
            model Test {
                id String @id
                x  Int
                @@allow('all', x  > 0 && x  > 1)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                AND:
                    [
                        {
                            x : {
                                gt: 0
                            }
                        }
                        ,
                        {
                            x : {
                                gt: 1
                            }
                        }
                    ]
            }`
        );

        await check(
            `
            model Test {
                id String @id
                x  Int
                @@allow('all', x  > 0 || x  > 1)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                OR:
                    [
                        {
                            x : {
                                gt: 0
                            }
                        }
                        ,
                        {
                            x : {
                                gt: 1
                            }
                        }
                    ]
            }`
        );

        await check(
            `
            model Test {
                id String @id
                x  Int
                @@allow('all', x  > 0 && x  > 1 || x  > 2)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                OR:
                    [
                        {
                            AND:
                                [
                                    {
                                        x : {
                                            gt: 0
                                        }
                                    }
                                    ,
                                    {
                                        x : {
                                            gt: 1
                                        }
                                    }
                                ]
                        }
                        ,
                        {
                            x : {
                                gt: 2
                            }
                        }
                    ]
            }`
        );

        await check(
            `
            model Test {
                id String @id
                x  Int
                @@allow('all', !(x  > 0 && x  > 1 || !(x  > 2)))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                NOT:
                {
                    OR:
                        [
                            {
                                AND:
                                    [
                                        {
                                            x : {
                                                gt: 0
                                            }
                                        }
                                        ,
                                        {
                                            x : {
                                                gt: 1
                                            }
                                        }
                                    ]
                            }
                            ,
                            {
                                NOT:
                                {
                                    x : {
                                        gt: 2
                                    }
                                }
                            }
                        ]
                }
            }`
        );
    });

    it('to-one relation query', async () => {
        await check(
            `
            model Foo {
                id String @id
                x  Int
                t Test?
            }

            model Test {
                id String @id
                foo Foo @relation(fields: [fooId], references: [id])
                fooId String @unique
                @@deny('all', foo.x  <= 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foo: {
                    x : {
                        lte: 0
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                id String @id
                t Test?
                x  Int
            }

            model Test {
                id String @id
                foo Foo @relation(fields: [fooId], references: [id])
                fooId String @unique
                @@deny('all', !(foo.x  > 0))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                NOT:
                {
                    foo: {
                        x : {
                            gt: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                id String @id
                t Test?
                x  Boolean
            }

            model Test {
                id String @id
                foo Foo @relation(fields: [fooId], references: [id])
                fooId String @unique
                @@deny('all', !foo.x)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                NOT: {
                    foo: {
                        x: true
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                id String @id
                bar Bar?
                t Test?
            }

            model Bar {
                id String @id
                x  Int
                foo Foo @relation(fields: [fooId], references: [id])
                fooId String @unique
            }

            model Test {
                id String @id
                foo Foo @relation(fields: [fooId], references: [id])
                fooId String @unique
                @@deny('all', foo.bar.x  <= 0)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foo: {
                    bar: {
                        x : {
                            lte: 0
                        }
                    }
                }
            }`
        );
    });

    it('to-many relation query', async () => {
        await check(
            `
            model Foo {
                id String @id
                t Test @relation(fields: [tId], references: [id])
                tId String
                x Int
            }

            model Test {
                id String @id
                foos Foo[]
                @@deny('all', foos?[x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foos: {
                    some: {
                        x: {
                            lte: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                id String @id
                t Test @relation(fields: [tId], references: [id])
                tId String
                x Int
            }

            model Test {
                id String @id
                foos Foo[]
                @@deny('all', foos![x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foos: {
                    every: {
                        x: {
                            lte: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                id String @id
                t Test @relation(fields: [tId], references: [id])
                tId String
                x Int
            }

            model Test {
                id String @id
                foos Foo[]
                @@deny('all', foos^[x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foos: {
                    none: {
                        x: {
                            lte: 0
                        }
                    }
                }
            }`
        );

        await check(
            `
            model Foo {
                id String @id
                bars Bar[]
                t Test @relation(fields: [tId], references: [id])
                tId String @unique
            }
            
            model Bar {
                id String @id
                foo Foo @relation(fields: [fooId], references: [id])
                fooId String
                x Int
            }

            model Test {
                id String @id
                foo Foo?
                @@deny('all', foo.bars?[x <= 0])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                foo: {
                    bars: {
                        some: {
                            x: {
                                lte: 0
                            }
                        }
                    }
                }
            }`
        );
    });

    it('auth null check', async () => {
        await check(
            `
            model User {
                id String @id
            }

            model Test {
                id String @id
                @@allow('all', auth() == null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `(user==null)?{AND:[]}:{OR:[]}`,
            '{ id: "1" }'
        );

        await check(
            `
            model User {
                x String
                y String
                @@id([x, y])
            }

            model Test {
                id String @id
                @@allow('all', auth() == null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `(user==null)?{AND:[]}:{OR:[]}`,
            '{ x: "1", y: "2" }'
        );

        await check(
            `
            model User {
                id String @id
            }

            model Test {
                id String @id
                @@allow('all', auth() != null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `(user!=null)?{AND:[]}:{OR:[]}`,
            '{ id: "1" }'
        );

        await check(
            `
            model User {
                x String
                y String
                @@id([x, y])
            }

            model Test {
                id String @id
                @@allow('all', auth() != null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `(user!=null)?{AND:[]}:{OR:[]}`,
            '{ x: "1", y: "2" }'
        );
    });

    it('auth boolean field check', async () => {
        await check(
            `
            model User {
                id String @id
                admin Boolean
            }

            model Test {
                id String @id
                @@allow('all', auth().admin)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `!!(user?.admin??null)?{AND:[]}:{OR:[]}`,
            '{ id: "1", admin: true }'
        );

        await check(
            `
            model User {
                id String @id
                admin Boolean
            }

            model Test {
                id String @id
                @@deny('all', !auth().admin)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ NOT: !!(user?.admin??null)?{AND:[]}:{OR:[]} }`,
            '{ id: "1", admin: true }'
        );
    });

    it('auth check against field single id', async () => {
        await check(
            `
            model User {
                id String @id
                t Test?
            }

            model Test {
                id String @id
                owner User @relation(fields: [ownerId], references: [id])
                ownerId String @unique
                @@allow('all', auth() == owner)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `(user==null) ? { OR: [] } : { owner: { is: { id : user.id } } }`
        );

        await check(
            `
                model User {
                    id String @id
                    t Test?
                }

                model Test {
                    id String @id
                    owner User @relation(fields: [ownerId], references: [id])
                    ownerId String @unique
                    @@deny('all', auth() != owner)
                }
                `,
            (model) => model.attributes[0].args[1].value,
            `(user==null) ? { AND: [] } : 
            { 
                owner: {
                    isNot: { id: user.id }
                }
            }`
        );

        await check(
            `
                model User {
                    id String @id
                    t Test?
                }

                model Test {
                    id String @id
                    owner User @relation(fields: [ownerId], references: [id])
                    ownerId String @unique
                    @@allow('all', auth().id == owner.id)
                }
                `,
            (model) => model.attributes[0].args[1].value,
            `((user?.id??null)==null) ?
                { OR: [] } : 
                { owner: { id: { equals: (user?.id ?? null) } } }`
        );
    });

    it('auth check against field multi-id', async () => {
        await check(
            `
            model User {
                x String
                y String
                t Test?
                @@id([x, y])
            }

            model Test {
                id String @id
                owner User @relation(fields: [ownerX, ownerY], references: [x, y])
                ownerX String
                ownerY String
                @@unique([ownerX, ownerY])
                @@allow('all', auth() == owner)
            }
            `,
            (model) => model.attributes[1].args[1].value,
            `(user==null) ? 
                { OR: [] } : 
                { owner: { is: { x: user.x, y: user.y } } }`,
            '{ x: "1", y: "2" }'
        );

        await check(
            `
            model User {
                x String
                y String
                t Test?
                @@id([x, y])
            }

            model Test {
                id String @id
                owner User @relation(fields: [ownerX, ownerY], references: [x, y])
                ownerX String
                ownerY String
                @@unique([ownerX, ownerY])
                @@allow('all', auth() != owner)
            }
            `,
            (model) => model.attributes[1].args[1].value,
            `(user==null) ? 
                { AND: [] } : 
                { owner: { isNot: { x: user.x, y: user.y } } }`,
            '{ x: "1", y: "2" }'
        );

        await check(
            `
            model User {
                x String
                y String
                t Test?
                @@id([x, y])
            }

            model Test {
                id String @id
                owner User @relation(fields: [ownerX, ownerY], references: [x, y])
                ownerX String
                ownerY String
                @@unique([ownerX, ownerY])
                @@allow('all', auth().x == owner.x && auth().y == owner.y)
            }
            `,
            (model) => model.attributes[1].args[1].value,
            `{ 
                AND: [
                    ((user?.x??null)==null) ? { OR: [] } : { owner: { x: { equals: (user?.x ?? null) } } },
                    ((user?.y??null)==null) ? { OR: [] } : { owner: { y: { equals: (user?.y ?? null) } } }
                ]
            }`,
            '{ x: "1", y: "2" }'
        );
    });

    it('auth check against nullable field', async () => {
        await check(
            `
            model User {
                id String @id
                t Test?
            }

            model Test {
                id String @id
                owner User? @relation(fields: [ownerId], references: [id])
                ownerId String? @unique
                @@allow('all', auth() == owner)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{
                owner: {
                    is: (user == null) ? null : { id: user.id }
                }
            }`
        );

        await check(
            `
                model User {
                    id String @id
                    t Test?
                }

                model Test {
                    id String @id
                    owner User? @relation(fields: [ownerId], references: [id])
                    ownerId String? @unique
                    @@deny('all', auth() != owner)
                }
                `,
            (model) => model.attributes[0].args[1].value,
            `{
                owner: {
                    isNot: (user == null) ? null : { id: user.id }
                }
            }`
        );

        await check(
            `
                model User {
                    id String @id
                    t Test?
                }

                model Test {
                    id String @id
                    owner User? @relation(fields: [ownerId], references: [id])
                    ownerId String? @unique
                    @@allow('all', auth().id == owner.id)
                }
                `,
            (model) => model.attributes[0].args[1].value,
            `((user?.id??null)==null) ? { OR: [] } : { owner: { id: { equals: (user?.id ?? null) } } }`
        );
    });

    it('auth check short-circuit [TBD]', async () => {
        await check(
            `
                model User {
                    id String @id
                    t Test?
                }

                model Test {
                    id String @id
                    owner User @relation(fields: [ownerId], references: [id])
                    ownerId String @unique
                    value Int
                    @@allow('all', auth() != null && auth().id == owner.id && value > 0)
                }
                `,
            (model) => model.attributes[0].args[1].value,
            `{
                AND: [
                    { 
                        AND: [
                            (user!=null)?{AND:[]}:{OR:[]},
                            ((user?.id??null)==null) ? {OR:[]} : { owner: { id: { equals: (user?.id??null) } } } 
                        ]
                    },
                    { value: { gt: 0 } }
                ]
            }`
        );

        await check(
            `
                model User {
                    id String @id
                    t Test?
                }

                model Test {
                    id String @id
                    owner User @relation(fields: [ownerId], references: [id])
                    ownerId String @unique
                    value Int
                    @@deny('all', auth() == null || auth().id != owner.id || value <= 0)
                }
                `,
            (model) => model.attributes[0].args[1].value,
            `{ 
                OR: [
                    { 
                        OR: [
                            (user==null)?{AND:[]}:{OR:[]},
                            ((user?.id??null)==null) ? {AND:[]} : { owner : { id: { not: { equals: (user?.id??null) } } } }
                        ]
                    },
                    { value: { lte: 0 } }
                ]
            }`
        );
    });

    it('auth using different model check', async () => {
        await check(
            `
            model Membership {
                id String @id
                t Test?
                @@auth()
            }

            model Test {
                id String @id
                owner Membership @relation(fields: [ownerId], references: [id])
                ownerId String @unique @allow('all', auth().id == owner.id)
                value Int
                @@allow('all', auth().id == owner.id)
               
            }
                `,
            (model) => {
                const args = model.attributes[0].args[1];
                return args.value;
            },
            `((user?.id??null)==null)?{
                OR:[]
            }:{
                owner:{
                     id:{
                         equals:(user?.id??null)
                    }
                }
            }`
        );
    });

    it('relation field null check', async () => {
        await check(
            `
            model M {
                id String @id
                s String?
                t Test @relation(fields: [tId], references: [id])
                tId String @unique
            }

            model Test {
                id String @id
                m M?
                @@allow('all', m == null || m.s == null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                OR: [{ m: { is: null } }, { m: { s: { equals: null } } }]
            }`
        );

        await check(
            `
            model M {
                id String @id
                s String?
                t Test @relation(fields: [tId], references: [id])
                tId String @unique
            }

            model Test {
                id String @id
                m M?
                @@deny('all', m != null || m.s != null)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                OR: [{ m: { isNot: null } }, { m: { s: { not: { equals: null } } } }]
            }
            `
        );
    });

    it('filter operators field access', async () => {
        await check(
            `
            enum Role {
                USER
                ADMIN
            }
            model Test {
                id String @id
                role Role
                @@allow('all', role in [USER, ADMIN])
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                role: { in: [Role.USER, Role.ADMIN] }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                value String
                @@allow('all', contains(value, 'foo'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                value: { contains: 'foo' }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                value String
                @@allow('all', contains(value, 'foo', true))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                value: { contains: 'foo', mode: 'insensitive' }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                value String
                @@allow('all', contains(value, 'foo', false))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                value: { contains: 'foo' }
            }
            `
        );

        await check(
            `
            model Foo {
                id String @id 
                value String
                test Test @relation(fields: [testId], references: [id])
                testId String @unique
            }
            model Test {
                id String @id
                foo Foo?
                @@allow('all', search(foo.value, 'foo'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                foo: {
                    value: { search: 'foo' }
                }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                value String
                @@allow('all', startsWith(value, 'foo') && endsWith(value, 'bar'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                AND: [ { value: { startsWith: 'foo' } }, { value: { endsWith: 'bar' } } ]
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                value String
                @@allow('all', !startsWith(value, 'foo'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                NOT: { value: { startsWith: 'foo' } }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                values Int[]
                @@allow('all', has(values, 1))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                values: { has: 1 }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                values Int[]
                @@allow('all', hasSome(values, [1, 2]))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                values: { hasSome: [1, 2] }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                values Int[]
                @@allow('all', hasEvery(values, [1, 2]))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                values: { hasEvery: [1, 2] }
            }
            `
        );

        await check(
            `
            model Test {
                id String @id
                values Int[]
                @@allow('all', isEmpty(values))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `
            {
                values: { isEmpty: true }
            }
            `
        );
    });

    it('filter operators non-field access', async () => {
        const userInit = `{ id: 'user1', email: 'test@zenstack.dev', roles: [Role.ADMIN] }`;
        const prelude = `        
            enum Role {
                USER
                ADMIN
            }
    
            model User {
                id String @id
                email String
                roles Role[]
            }
        `;

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', ADMIN in auth().roles)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.roles?.includes(Role.ADMIN))??false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                roles Role[]
                @@allow('all', ADMIN in roles)
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{roles:{has:Role.ADMIN}}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', contains(auth().email, 'test'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.email?.includes('test'))??false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', contains(auth().email, 'test', true))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.email?.toLowerCase().includes('test'?.toLowerCase()))??false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', startsWith(auth().email, 'test'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.email?.startsWith('test'))??false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', endsWith(auth().email, 'test'))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.email?.endsWith('test'))??false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', has(auth().roles, ADMIN))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.roles?.includes(Role.ADMIN))??false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', hasEvery(auth().roles, [ADMIN, USER]))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.roles)!==undefined?([Role.ADMIN,Role.USER]?.every((item)=>user?.roles?.includes(item))):false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', hasSome(auth().roles, [USER, ADMIN]))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `((user?.roles)!==undefined?([Role.USER,Role.ADMIN]?.some((item)=>user?.roles?.includes(item))):false)?{AND:[]}:{OR:[]}`,
            userInit
        );

        await check(
            `
            ${prelude}
            model Test {
                id String @id
                @@allow('all', isEmpty(auth().roles))
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `(!user?.roles||user?.roles?.length===0)?{AND:[]}:{OR:[]}`,
            userInit
        );
    });

    it('now() function', async () => {
        await check(
            `
            model Test {
                id String @id
                createdAt DateTime @default(now())
                @@allow('all', createdAt <= now())
            }
            `,
            (model) => model.attributes[0].args[1].value,
            `{ createdAt: { lte: (new Date()) } }`
        );
    });
});

async function check(schema: string, getExpr: (model: DataModel) => Expression, expected: string, userInit?: string) {
    if (!schema.includes('datasource ')) {
        schema =
            `
    datasource db {
        provider = 'postgresql'
        url = 'dummy'
    }
    ` + schema;
    }

    const model = await loadModel(schema);
    const expr = getExpr(model.declarations.find((d) => isDataModel(d) && d.name === 'Test') as DataModel);

    const project = new Project();

    const { name: sourcePath } = tmp.fileSync({ postfix: '.ts' });
    const sf = project.createSourceFile(sourcePath, undefined, {
        overwrite: true,
    });

    // inject enums
    model.declarations
        .filter((d) => isEnum(d))
        .map((e) => {
            sf.addVariableStatement({
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: e.name,
                        initializer: `
              {
                ${(e as Enum).fields.map((f) => `${f.name}: "${f.name}"`).join(',\n')}
              }
              `,
                    },
                ],
            });
        });

    // inject user variable
    sf.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [{ name: 'user', initializer: userInit ?? '{ id: "user1" }' }],
    });

    sf.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            {
                name: 'expr',
                initializer: (writer) => new ExpressionWriter(writer, { operationContext: 'read' }).write(expr),
            },
        ],
    });

    await project.save();
    console.log('Source saved:', sourcePath);

    if (project.getPreEmitDiagnostics().length > 0) {
        for (const d of project.getPreEmitDiagnostics()) {
            console.warn(`${d.getLineNumber()}: ${d.getMessageText()}`);
        }
        throw new Error('Compilation errors occurred');
    }

    const outExpr = sf.getVariableDeclaration('expr');
    // console.log('Generated expr:\n', outExpr?.getText());

    if (expected) {
        const generatedExpr = outExpr?.getInitializer()?.getText();
        expect(generatedExpr && generatedExpr.replace(/\s+/g, '')).toBe(expected.replace(/\s+/g, ''));
    }
}
