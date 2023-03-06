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
                @@id([x, y], name: 'x_y', map: '_x_y')
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique([x, y])
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
                _bit Boolean @db.Bit
                _bit1 Boolean @db.Bit(1)
                _tinyInt Boolean @db.TinyInt
                _tinyInt1 Boolean @db.TinyInt(1)
            }

            model _Int {
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
                _unsignedBigInt BigInt @db.UnsignedBigInt
                _int8 BigInt @db.Int8
            }

            model _FloatDecimal {
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
                _jsonb Json @db.JsonB
            }

            model _Bytes {
                _byteA Bytes @db.ByteA
                _longBlob Bytes @db.LongBlob
                _binary Bytes @db.Binary
                _varBinary Bytes @db.VarBinary
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

    it('auth function check', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}

            model Post {
                id String @id
                @@allow('all', auth() != null)
            }
        `)
        ).toContain(`auth() cannot be resolved because no "User" model is defined`);

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
            }

            model B {
                id String @id
                a A
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
                e E @default(E1)
            }
        `);
    });
});
