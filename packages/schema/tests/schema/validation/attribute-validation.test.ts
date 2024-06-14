/// <reference types="@types/jest" />

import { loadModel, loadModelWithError } from '../../utils';

describe('Attribute tests', () => {
    const prelude = `
        datasource db {
            provider = "postgresql"
            url = "url"
        }
    `;

    it('builtin field attributes', async () => {
        await loadModel(`
            ${prelude}
            model M {
                x String @id @default("abc") @unique @map("_id")
                y DateTime @updatedAt
            }
        `);
    });

    it('field attribute type checking', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id(123)
            }
        `)
        ).toContain(`Unexpected unnamed argument`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default(value:'def', 'abc')
            }
        `)
        ).toContain(`Unexpected unnamed argument`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default('abc', value:'def')
            }
        `)
        ).toContain(`Parameter "value" is already provided`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default(123)
            }
        `)
        ).toContain(`Value is not assignable to parameter`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default()
            }
        `)
        ).toContain(`Required parameter not provided: value`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default('abc', value: 'def')
            }
        `)
        ).toContain(`Parameter "value" is already provided`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default(foo: 'abc')
            }
        `)
        ).toContain(`Attribute "@default" doesn't have a parameter named "foo"`);

        expect(
            await loadModelWithError(`
        ${prelude}
        model M {
            id String @id()
            dt DateTime @default('2020abc')
        }
        `)
        ).toContain('Value is not assignable to parameter');

        // auto-convert of string to date time
        await loadModel(`
            ${prelude}
            model M {
                id String @id()
                dt DateTime @default('2000-01-01T00:00:00Z')
            }
        `);

        // auto-convert of string to bytes
        await loadModel(`
            ${prelude}
            model M {
                id String @id()
                dt Bytes @default('abc123')
            }
        `);
    });

    it('field attribute coverage', async () => {
        await loadModel(`
            ${prelude}
            model A {
                id String @id
            }

            model B {
                id String @id()
            }

            model C {
                id String @id(map: "__id")
            }

            model D {
                id String @id
                x String @default("x")
            }

            model E {
                id String @id
                x String @default(value: "x")
            }

            model F {
                id String @id
                x String @default(uuid())
            }

            model G {
                id String @id
                x Int @default(autoincrement())
            }

            model H {
                id String @id
                x String @unique()
            }
        `);
    });

    it('model attribute coverage', async () => {
        await loadModel(`
        ${prelude}
            model A {
                x Int
                y String
                @@id([x, y], name: 'x_y', map: '_x_y', length: 10, sort: Asc, clustered: true)
            }

            model B {
                id String @id(map: '_id', length: 10, sort: Asc, clustered: true)
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique([x, y], name: 'x_y', map: '_x_y', length: 10, sort: Asc, clustered: true)
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique(fields: [x, y])
            }
        `);

        await loadModel(`
        ${prelude}
            model A {
                id String @id
                x Int @unique(map: '_x', length: 10, sort: Asc, clustered: true)
            }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique([x, z])
            }
        `)
        ).toContain(`Could not resolve reference to ReferenceTarget named 'z'.`);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@index([x, y])
            }

            model B {
                id String @id
                x Int
                y String
                @@index([x(sort: Asc), y(sort: Desc)], name: 'myindex', map: '_myindex', length: 10, sort: Asc, clustered: true, type: BTree)
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x String
                y String
                z String
                @@fulltext([x, y, z])
            }

            model B {
                id String @id
                x String
                y String
                z String
                @@fulltext([x, y, z], map: "n")
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int @map("_x")
                y String
                @@map("__A")
            }
        `);

        await loadModel(`
            ${prelude}
            enum Role {
                ADMIN @map("admin")
                CUSTOMER @map("customer")
                @@map("_Role")
            }
        `);
    });

    it('type modifier attribute coverage', async () => {
        await loadModel(`
            ${prelude}

            model _String {
                id String @id
                _string String @db.String
                _string1 String @db.String(1)
                _text String @db.Text
                _ntext String @db.NText
                _char String @db.Char(10)
                _nchar String @db.NChar(10)
                _varchar String @db.VarChar(10)
                _nvarChar String @db.NVarChar(10)
                _catalogSingleChar String @db.CatalogSingleChar
                _tinyText String @db.TinyText
                _mediumText String @db.MediumText
                _longText String @db.LongText
                _bit String @db.Bit
                _bit1 String @db.Bit(1)
                _varbit String @db.VarBit
                _varbit1 String @db.VarBit(1)
                _uuid String @db.Uuid
                _uniqueIdentifier String @db.UniqueIdentifier
                _xml String @db.Xml
                _inet String @db.Inet
                _citext String @db.Citext
            }

            model _Boolean {
                id String @id
                _boolean Boolean @db.Boolean
                _bit Boolean @db.Bit
                _bit1 Boolean @db.Bit(1)
                _tinyInt Boolean @db.TinyInt
                _tinyInt1 Boolean @db.TinyInt(1)
            }

            model _Int {
                id String @id
                _int Int @db.Int
                _integer Int @db.Integer
                _smallInt Int @db.SmallInt
                _oid Int @db.Oid
                _unsignedInt Int @db.UnsignedInt
                _unsignedSmallInt Int @db.UnsignedSmallInt
                _mediumInt Int @db.MediumInt
                _unsignedMediumInt Int @db.UnsignedMediumInt
                _unsignedTinyInt Int @db.UnsignedTinyInt
                _year Int @db.Year
                _int4 Int @db.Int4
                _int2 Int @db.Int2
            }

            model _BigInt {
                id String @id
                _bigInt BigInt @db.BigInt
                _unsignedBigInt BigInt @db.UnsignedBigInt
                _int8 BigInt @db.Int8
            }

            model _FloatDecimal {
                id String @id
                _float Float @db.Float
                _decimal Decimal @db.Decimal
                _decimal1 Decimal @db.Decimal(10, 2)
                _doublePrecision Float @db.DoublePrecision
                _real Float @db.Real
                _double Float @db.Double
                _money Float @db.Money
                _money1 Decimal @db.Money
                _smallMoney Float @db.SmallMoney
                _float8 Float @db.Float8
                _float4 Float @db.Float4
            }

            model _DateTime {
                id String @id
                _dateTime DateTime @db.DateTime
                _dateTime2 DateTime @db.DateTime2
                _smallDateTime DateTime @db.SmallDateTime
                _dateTimeOffset DateTime @db.DateTimeOffset
                _timestamp DateTime @db.Timestamp
                _timestamp1 DateTime @db.Timestamp(1)
                _timestamptz DateTime @db.Timestamptz
                _timestamptz1 DateTime @db.Timestamptz(1)
                _date DateTime @db.Date
                _time DateTime @db.Time
                _time1 DateTime @db.Time(1)
                _timetz DateTime @db.Timetz
                _timetz1 DateTime @db.Timetz(1)
            }

            model _Json {
                id String @id
                _json Json @db.Json
                _jsonb Json @db.JsonB
            }

            model _Bytes {
                id String @id
                _bytes Bytes @db.Bytes
                _byteA Bytes @db.ByteA
                _longBlob Bytes @db.LongBlob
                _binary Bytes @db.Binary
                _varBinary Bytes @db.VarBinary
                _varBinarySized Bytes @db.VarBinary(100)
                _tinyBlob Bytes @db.TinyBlob
                _blob Bytes @db.Blob
                _mediumBlob Bytes @db.MediumBlob
                _image Bytes @db.Image
            }
        `);
    });

    it('attribute function coverage', async () => {
        await loadModel(`
            ${prelude}
            model User { id String @id }

            model A {
                id String @id @default(uuid())
                id1 String @default(cuid())
                nanodId String @default(nanoid())
                nanodIdWithLength String @default(nanoid(3))
                created DateTime @default(now())
                serial Int @default(autoincrement())
                foo String @default(dbgenerated("gen_random_uuid()"))
                @@allow('all', auth() != null)
            }
        `);
    });

    it('attribute function check', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id @default(foo())
            }
        `)
        ).toContain(`Could not resolve reference to FunctionDecl named 'foo'.`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id Int @id @default(uuid())
            }
        `)
        ).toContain(`Value is not assignable to parameter`);
    });

    it('policy expressions', async () => {
        await loadModel(`
           ${prelude}
           model A {
               id String @id
               x Int
               x1 Int
               y DateTime
               y1 DateTime
               z Float
               z1 Decimal
               foo Boolean
               bar Boolean

               @@allow('all', x > 0)
               @@allow('all', x > x1)
               @@allow('all', y >= y1)
               @@allow('all', z < z1)
               @@allow('all', z1 < z)
               @@allow('all', x < z)
               @@allow('all', x < z1)
               @@allow('all', foo && bar)
               @@allow('all', foo || bar)
               @@allow('all', !foo)
           }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x String
                @@allow('all', x > 0)
            }
        `)
        ).toContain('invalid operand type for ">" operator');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x String
                @@allow('all', x < 0)
            }
        `)
        ).toContain('invalid operand type for "<" operator');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x String
                y String
                @@allow('all', x < y)
            }
        `)
        ).toContain('invalid operand type for "<" operator');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x String
                y String
                @@allow('all', x <= y)
            }
        `)
        ).toContain('invalid operand type for "<=" operator');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                y DateTime
                @@allow('all', x <= y)
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x String
                y String
                @@allow('all', x && y)
            }
        `)
        ).toContain('invalid operand type for "&&" operator');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x String
                y String
                @@allow('all', x || y)
            }
        `)
        ).toContain('invalid operand type for "||" operator');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                @@allow('all', x == this)
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                @@allow('all', this != x)
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                b B?
                @@allow('all', b == this)
            }
            model B {
                id String @id
                a A? @relation(fields: [aId], references: [id])
                aId String
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                b B?
                @@allow('all', this != b)
            }
            model B {
                id String @id
                a A? @relation(fields: [aId], references: [id])
                aId String
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                y Int[]

                @@allow(true, x == y)
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                y Int[]

                @@allow(true, x > y)
            }
        `)
        ).toContain('operand cannot be an array');

        expect(
            await loadModelWithError(`
            ${prelude}
            model User {
                id Int @id
                foo Foo @relation(fields: [fooId], references: [id])
                fooId Int
            }

            model Foo {
                id Int @id
                users User[]

                @@allow('all', users == auth())
            }
        `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                other A? @relation('other', fields: [otherId], references: [id])
                otherId String? @unique
                holder A? @relation('other')
                @@allow('all', other == this)
            }
        `)
        ).toContain('comparison between model-typed fields are not supported');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                other A? @relation('other', fields: [otherId], references: [id])
                otherId String? @unique
                holder A? @relation('other')
                @@allow('all', this != other)
            }
        `)
        ).toContain('comparison between model-typed fields are not supported');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                other A? @relation('other', fields: [otherId], references: [id])
                otherId String? @unique
                holder A? @relation('other')
                other1 A? @relation('other1', fields: [otherId1], references: [id])
                other1Id String? @unique
                holder1 A? @relation('other1')
                @@allow('all', other == other1)
            }
        `)
        ).toContain('comparison between model-typed fields are not supported');

        expect(
            await loadModelWithError(`
            ${prelude}
            model User {
                id Int @id
                lists List[]
                todos Todo[]
            }
              
            model List {
                id Int @id
                user User @relation(fields: [userId], references: [id])
                userId Int
                todos Todo[]
            }
              
            model Todo {
                id Int @id
                user User @relation(fields: [userId], references: [id])
                userId Int
                list List @relation(fields: [listId], references: [id])
                listId Int
              
                @@allow('read', list.user.id == userId)
            }
            
        `)
        ).toContain('comparison between fields of different models is not supported in model-level "read" rules');

        expect(
            await loadModelWithError(`
            ${prelude}
            model User {
                id Int @id
                lists List[]
                todos Todo[]
                value Int
            }
              
            model List {
                id Int @id
                user User @relation(fields: [userId], references: [id])
                userId Int
                todos Todo[]
            }
              
            model Todo {
                id Int @id
                user User @relation(fields: [userId], references: [id])
                userId Int
                list List @relation(fields: [listId], references: [id])
                listId Int
                value Int
              
                @@allow('all', list.user.value > value)
            }
            
        `)
        ).toContain('comparison between fields of different models is not supported in model-level "read" rules');

        expect(
            await loadModel(`
            ${prelude}
            model User {
                id Int @id
                lists List[]
                todos Todo[]
            }
              
            model List {
                id Int @id
                user User @relation(fields: [userId], references: [id])
                userId Int
                todos Todo[]
            }
              
            model Todo {
                id Int @id
                user User @relation(fields: [userId], references: [id])
                userId Int
                list List @relation(fields: [listId], references: [id])
                listId Int
              
                @@allow('create', list.user.id == userId)
            }
            
        `)
        ).toBeTruthy();

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                b B?
                c C?
                @@allow('all', b == c)
            }
            model B {
                id String @id
                a A? @relation(fields: [aId], references: [id])
                aId String
            }
            model C {
                id String @id
                a A? @relation(fields: [aId], references: [id])
                aId String
            }
            `)
        ).toContain('incompatible operand types');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                b B?
                c C?
                @@allow('all', b != c)
            }
            model B {
                id String @id
                a A? @relation(fields: [aId], references: [id])
                aId String
            }
            model C {
                id String @id
                a A? @relation(fields: [aId], references: [id])
                aId String
            }
            `)
        ).toContain('incompatible operand types');
    });

    it('policy filter function check', async () => {
        await loadModel(`
            ${prelude}
            enum E {
                E1
                E2
            }

            model N {
                id String @id
                e E
                es E[]
                s String
                i Int
                m M @relation(fields: [mId], references: [id])
                mId String @unique
            }

            model M {
                id String @id
                s String
                e E
                es E[]
                n N?

                @@allow('all', e in [E1, E2])
                @@allow('all', contains(s, 'a'))
                @@allow('all', contains(s, 'a', true))
                @@allow('all', search(s, 'a'))
                @@allow('all', startsWith(s, 'a'))
                @@allow('all', endsWith(s, 'a'))
                @@allow('all', has(es, E1))
                @@allow('all', hasSome(es, [E1]))
                @@allow('all', hasEvery(es, [E1]))
                @@allow('all', isEmpty(es))

                @@allow('all', n.e in [E1, E2])
                @@allow('all', n.i in [1, 2])
                @@allow('all', contains(n.s, 'a'))
                @@allow('all', contains(n.s, 'a', true))
                @@allow('all', search(n.s, 'a'))
                @@allow('all', startsWith(n.s, 'a'))
                @@allow('all', endsWith(n.s, 'a'))
                @@allow('all', has(n.es, E1))
                @@allow('all', hasSome(n.es, [E1]))
                @@allow('all', hasEvery(n.es, [E1]))
                @@allow('all', isEmpty(n.es))
            }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                s String
                @@allow('all', contains(s))
            }
        `)
        ).toContain('missing argument for parameter "search"');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                s String
                @@allow('all', contains('a', s))
            }
        `)
        ).toContain('first argument must be a field reference');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                s String
                s1 String
                @@allow('all', contains(s, s1))
            }
        `)
        ).toContain('second argument must be a literal, an enum, or an array of them');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                i Int
                @@allow('all', contains(i, 1))
            }
        `)
        ).toContain('argument is not assignable to parameter');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                i Int
                @@allow('all', i in 1)
            }
        `)
        ).toContain('right operand of "in" must be an array');

        expect(
            await loadModelWithError(`
            ${prelude}
            model N { 
                id String @id 
                m M @relation(fields: [mId], references: [id])
                mId String
            }
            model M {
                id String @id
                n N?
                @@allow('all', n in [1])
            }
        `)
        ).toContain('left operand of "in" must be of scalar type');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int
                @@allow('all', has(x, 1))
            }
        `)
        ).toContain('argument is not assignable to parameter');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int[]
                @@allow('all', hasSome(x, 1))
            }
        `)
        ).toContain('argument is not assignable to parameter');
    });

    it('validator filter function check', async () => {
        await loadModel(`
            ${prelude}
            enum E {
                E1
                E2
            }

            model N {
                id String @id
                e E
                es E[]
                s String
                i Int
                m M @relation(fields: [mId], references: [id])
                mId String @unique
            }

            model M {
                id String @id
                s String
                e E
                es E[]
                n N?

                @@validate(e in [E1, E2])
                @@validate(contains(s, 'a'))
                @@validate(contains(s, 'a', true))
                @@validate(startsWith(s, 'a'))
                @@validate(endsWith(s, 'a'))
                @@validate(has(es, E1))
                @@validate(hasSome(es, [E1]))
                @@validate(hasEvery(es, [E1]))
                @@validate(isEmpty(es))
            }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                s String
                @@validate(contains(s))
            }
        `)
        ).toContain('missing argument for parameter "search"');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                s String
                @@validate(contains('a', s))
            }
        `)
        ).toContain('first argument must be a field reference');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                s String
                s1 String
                @@validate(contains(s, s1))
            }
        `)
        ).toContain('second argument must be a literal, an enum, or an array of them');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                i Int
                @@validate(contains(i, 1))
            }
        `)
        ).toContain('argument is not assignable to parameter');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                i Int
                @@validate(i in 1)
            }
        `)
        ).toContain('right operand of "in" must be an array');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int
                @@validate(has(x, 1))
            }
        `)
        ).toContain('argument is not assignable to parameter');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int[]
                @@validate(hasSome(x, 1))
            }
        `)
        ).toContain('argument is not assignable to parameter');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                n N?
                @@validate(n.value > 0)
            }

            model N {
                id String @id
                value Int
                m M @relation(fields: [mId], references: [id])
                mId String @unique
            }
        `)
        ).toContain('`@@validate` condition cannot use relation fields');
    });

    it('auth function check', async () => {
        await loadModel(`
        ${prelude}

        model User {
            id String @id
            name String
        }
        model B {
            id String @id
            userId String @default(auth().id)
            userName String @default(auth().name)
        }
    `);

        expect(
            await loadModelWithError(`
            ${prelude}

            model Post {
                id String @id
                @@allow('all', auth() != null)
            }
        `)
        ).toContain(`auth() cannot be resolved because no model marked with "@@auth()" or named "User" is found`);

        await loadModel(`
            ${prelude}

            model User {
                id String @id
                name String
            }

            model Post {
                id String @id
                @@allow('all', auth().name != null)
            }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}

            model User {
                id String @id
                name String
            }

            model Post {
                id String @id
                @@allow('all', auth().email != null)
            }
        `)
        ).toContain(`Could not resolve reference to DataModelField named 'email'.`);
    });

    it('collection predicate expression check', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}

            model A { 
                id String @id 
                x Int
                b B @relation(references: [id], fields: [bId])
                bId String @unique
            }

            model B {
                id String @id
                a A?
                aId String @unique
                @@allow('all', a?[x > 0])
            }
        `)
        ).toContain(`collection predicate can only be used on an array of model type`);

        await loadModel(`
        ${prelude}

            model A { 
                id String @id 
                x Int
                b B @relation(references: [id], fields: [bId])
                bId String
            }

            model B {
                id String @id
                a A[]
                @@allow('all', a?[x > 0])
            }
        `);
    });

    it('invalid attribute target field', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id @gt(10)
            }
        `)
        ).toContain('attribute "@gt" cannot be used on this type of field');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int @length(5)
            }
        `)
        ).toContain('attribute "@length" cannot be used on this type of field');
    });

    it('enum as default', async () => {
        await loadModel(`
            ${prelude}

            enum E {
                E1
                E2
            }

            model M {
                id String @id
                e E @default(E1)
            }
        `);
    });

    it('incorrect function expression context', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                @@allow('all', autoincrement() > 0)
            }
        `)
        ).toContain('function "autoincrement" is not allowed in the current context: AccessPolicy');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                @@deny('all', uuid() == null)
            }
        `)
        ).toContain('function "uuid" is not allowed in the current context: AccessPolicy');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x String
                @@validate(search(x, 'abc'))
            }
        `)
        ).toContain('function "search" is not allowed in the current context: ValidationRule');
    });

    it('invalid policy rule kind', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int
                @@allow('read,foo', x > 0)
            }
        `)
        ).toContain('Invalid policy rule kind: "foo", allowed: "create", "read", "update", "delete", "all"');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int
                @@deny('update,foo', x > 0)
            }
        `)
        ).toContain('Invalid policy rule kind: "foo", allowed: "create", "read", "update", "delete", "all"');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int @allow('foo', x > 0)
            }
        `)
        ).toContain('Invalid policy rule kind: "foo", allowed: "read", "update", "all"');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int @deny('foo', x < 0)
            }
        `)
        ).toContain('Invalid policy rule kind: "foo", allowed: "read", "update", "all"');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int @allow('update', future().x > 0)
            }
        `)
        ).toContain('"future()" is not allowed in field-level policy rules');

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                n N @allow('update', n.x > 0)
            }

            model N {
                id String @id
                x Int
                m M? @relation(fields: [mId], references: [id])
                mId String
            }
        `)
        ).toContain(
            'Field-level policy rules with "update" or "all" kind are not allowed for relation fields. Put rules on foreign-key fields instead.'
        );

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                n N[] @allow('update', n.x > 0)
            }

            model N {
                id String @id
                x Int
                m M? @relation(fields: [mId], references: [id])
                mId String
            }
        `)
        ).toContain(
            'Field-level policy rules with "update" or "all" kind are not allowed for relation fields. Put rules on foreign-key fields instead.'
        );
    });
});
