import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Attribute application validation tests', () => {
    describe('Model-level policy attributes (@@allow, @@deny)', () => {
        it('accepts valid policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('create', true)
                    @@allow('read', true)
                    @@allow('update', true)
                    @@allow('post-update', true)
                    @@allow('delete', true)
                    @@deny('all', false)
                }
            `);
        });

        it('accepts comma-separated policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('create, read, update', true)
                    @@deny('delete, post-update', false)
                }
            `);
        });

        it('rejects invalid policy kind', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('invalid', true)
                }
                `,
                `Invalid policy rule kind`,
            );
        });

        it('rejects before in create policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('create', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('rejects before in read policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('read', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('rejects before in non-post-update policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('update', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('rejects before in delete policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('delete', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('accepts before in post-update policies', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('post-update', before().x > 2)
                }
            `);
        });

        it('rejects non-owned relation in create policy', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('create', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
                `,
                `non-owned relation fields are not allowed in "create" rules`,
            );
        });

        it('rejects non-owned relation in all policy', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('all', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
                `,
                `non-owned relation fields are not allowed in "create" rules`,
            );
        });

        it('accepts owned relation in create policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bar Bar @relation(fields: [barId], references: [id])
                    barId Int
                    @@allow('create', bar.x > 0)
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foos Foo[]
                    @@allow('all', true)
                }
            `);
        });

        it('accepts non-owned relation in read policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('read', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
            `);
        });

        it('accepts non-owned relation in update policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('update', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
            `);
        });

        it('accepts auth() relation access in create policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id Int @id @default(autoincrement())
                    posts Post[]
                    @@allow('all', true)
                    @@auth()
                }

                model Post {
                    id Int @id @default(autoincrement())
                    author User @relation(fields: [authorId], references: [id])
                    authorId Int
                    @@allow('create', auth().posts?[id > 0])
                }
            `);
        });
    });

    describe('Field-level policy attributes (@allow, @deny)', () => {
        it('accepts valid field-level policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @allow('read', true)
                    y  Int @allow('update', true)
                    z  Int @deny('all', false)
                    @@allow('all', true)
                }
            `);
        });

        it('accepts comma-separated field-level policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @allow('read, update', true)
                    @@allow('all', true)
                }
            `);
        });

        it('rejects before in field-level policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @deny('update', before(x) > 2)
                    @@allow('all', true)
                }
                `,
                `"before()" is not allowed in field-level policies`,
            );
        });

        it('rejects field-level policy on relation fields', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bar Bar @relation(fields: [barId], references: [id]) @allow('read', true)
                    barId Int
                    @@allow('all', true)
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    foos Foo[]
                    @@allow('all', true)
                }
                `,
                `Field-level policies are not allowed for relation fields`,
            );
        });

        it('rejects field-level policy on computed fields', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x Int
                    doubled Int @computed @allow('read', true)
                    @@allow('all', true)
                }
                `,
                `Field-level policies are not allowed for computed fields`,
            );
        });

        it('accepts field-level policy on regular fields', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @allow('read', true)
                    y  String @deny('update', false)
                    @@allow('all', true)
                }
            `);
        });

        it('accepts complex expressions in field-level policies', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id Int @id @default(autoincrement())
                    email String
                    posts Post[]
                    @@allow('all', true)
                    @@auth()
                }

                model Post {
                    id Int @id @default(autoincrement())
                    title String @allow('update', auth() != null && auth().id == authorId)
                    author User @relation(fields: [authorId], references: [id])
                    authorId Int
                    @@allow('all', true)
                }
            `);
        });
    });

    describe('Field-level @fuzzy attribute', () => {
        it('accepts @fuzzy on a String field with postgres provider', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = 'postgresql://localhost/test'
                }

                model Flavor {
                    id          Int     @id @default(autoincrement())
                    name        String  @fuzzy
                    description String? @fuzzy
                }
            `);
        });

        it('rejects @fuzzy with sqlite provider', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Flavor {
                    id   Int    @id @default(autoincrement())
                    name String @fuzzy
                }
                `,
                /`@fuzzy` is only supported for the `postgresql` provider/,
            );
        });

        it('rejects @fuzzy with mysql provider', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'mysql'
                    url      = 'mysql://localhost/test'
                }

                model Flavor {
                    id   Int    @id @default(autoincrement())
                    name String @fuzzy
                }
                `,
                /`@fuzzy` is only supported for the `postgresql` provider/,
            );
        });

        it('rejects @fuzzy on a non-String field', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'postgresql'
                    url      = 'postgresql://localhost/test'
                }

                model Flavor {
                    id    Int @id @default(autoincrement())
                    count Int @fuzzy
                }
                `,
                /attribute "@fuzzy" cannot be used on this type of field/,
            );
        });
    });

    describe('Field-level @@@onceInModel attribute', () => {
        it('accepts a single field carrying the attribute', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                attribute @softDelete() @@@targetField([DateTimeField]) @@@onceInModel

                model Foo {
                    id        Int       @id @default(autoincrement())
                    deletedAt DateTime? @softDelete
                }
            `);
        });

        it('rejects two fields in the same model carrying the attribute', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                attribute @softDelete() @@@targetField([DateTimeField]) @@@onceInModel

                model Foo {
                    id        Int       @id @default(autoincrement())
                    deletedAt DateTime? @softDelete
                    removedAt DateTime? @softDelete
                }
                `,
                /Attribute "@softDelete" can only be applied to one field per model/,
            );
        });

        it('rejects when the attribute is inherited from a mixin and also declared locally', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                attribute @softDelete() @@@targetField([DateTimeField]) @@@onceInModel

                type Base {
                    deletedAt DateTime? @softDelete
                }

                model Foo with Base {
                    id        Int       @id @default(autoincrement())
                    removedAt DateTime? @softDelete
                }
                `,
                /Attribute "@softDelete" can only be applied to one field per model/,
            );
        });

        // Duplicates that only co-occur through inheritance (none declared on the leaf model itself)
        // are detected at the model level via `getAllFields`.
        it('rejects when the attribute arrives only through inheritance (two mixins)', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                attribute @softDelete() @@@targetField([DateTimeField]) @@@onceInModel

                type Base1 {
                    deletedAt DateTime? @softDelete
                }

                type Base2 {
                    removedAt DateTime? @softDelete
                }

                model Foo with Base1 Base2 {
                    id Int @id @default(autoincrement())
                }
                `,
                /Attribute "@softDelete" can only be applied to one field per model/,
            );
        });
    });

    describe('Field-level @uuid attribute', () => {
        it('does not require a version arg', async () => {
            await loadSchema(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @uuid
                }
                `,
            );
        });

        it('accepts supported version args', async () => {
            await loadSchema(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @uuid(4)
                }
                `,
            );

            await loadSchema(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @uuid(7)
                }
                `,
            );
        });

        it('rejects unsupported version args', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @uuid(1)
                }
                `,
                /`@uuid` version must be `4` or `7`/,
            );

            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @uuid(2)
                }
                `,
                /`@uuid` version must be `4` or `7`/,
            );
        });
    });

    describe('Native type mapping attributes', () => {
        describe('sqlite', () => {
            it('rejects when any native type mapping attribute is used', async () => {
                // postgresql attribute
                await loadSchemaWithError(
                    `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @db.Uuid
                }
                `,
                    `attribute "@db.Uuid" cannot be used with the "sqlite" provider`,
                );

                // mysql attribute
                await loadSchemaWithError(
                    `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id Int @id @db.TinyInt
                }
                `,
                    `attribute "@db.TinyInt" cannot be used with the "sqlite" provider`,
                );

                // postgres/mysql attribute
                await loadSchemaWithError(
                    `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @db.Text
                }
                `,
                    `attribute "@db.Text" cannot be used with the "sqlite" provider`,
                );
            });
        });

        describe('postgresql', () => {
            it('allows all postgresql attributes', async () => {
                await loadSchema(
                    `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id                     Int      @id @default(autoincrement())

                    text                   String   @db.Text
                    char                   String   @db.Char(10)
                    varchar                String   @db.VarChar(255)
                    bitString              String   @db.Bit(8)
                    varBit                 String   @db.VarBit
                    uuid                   String   @db.Uuid
                    xml                    String   @db.Xml
                    inet                   String   @db.Inet
                    citext                 String   @db.Citext

                    boolean                Boolean  @db.Boolean

                    int                    Int      @db.Int
                    integer                Int      @db.Integer
                    smallInt               Int      @db.SmallInt
                    oid                    Int      @db.Oid

                    bigInt                 BigInt   @db.BigInt

                    doublePrecisionFloat   Float    @db.DoublePrecision
                    doublePrecisionDecimal Decimal  @db.DoublePrecision

                    realFloat              Float    @db.Real
                    realDecimal            Decimal  @db.Real

                    decimalFloat           Float    @db.Decimal(10, 2)
                    decimalDecimal         Decimal  @db.Decimal(10, 2)

                    moneyFloat             Float    @db.Money
                    moneyDecimal           Decimal  @db.Money

                    timestamp              DateTime @db.Timestamp(6)
                    timestamptz            DateTime @db.Timestamptz(6)
                    date                   DateTime @db.Date
                    time                   DateTime @db.Time(6)
                    timetz                 DateTime @db.Timetz(6)

                    json                   Json     @db.Json
                    jsonb                  Json     @db.JsonB

                    bytea                  Bytes    @db.ByteA
                }
                `,
                );
            });

            it('rejects mysql attributes', async () => {
                await loadSchemaWithError(
                    `
                datasource db {
                    provider = 'postgresql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id Int @id @db.TinyInt
                }
                `,
                    `attribute "@db.TinyInt" cannot be used with the "postgresql" provider`,
                );
            });
        });

        describe('mysql', () => {
            it('allows all mysql attributes', async () => {
                await loadSchema(
                    `
                datasource db {
                    provider = 'mysql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id                Int      @id @default(autoincrement())

                    text              String   @db.Text
                    char              String   @db.Char(10)
                    varchar           String   @db.VarChar(255)
                    tinyText          String   @db.TinyText
                    mediumText        String   @db.MediumText
                    longText          String   @db.LongText

                    bitString         String   @db.Bit(8)
                    bitBool           Boolean  @db.Bit(1)
                    bitBytes          Bytes    @db.Bit(64)

                    tinyIntBool       Boolean  @db.TinyInt(1)

                    int               Int      @db.Int
                    smallInt          Int      @db.SmallInt
                    mediumInt         Int      @db.MediumInt
                    tinyInt           Int      @db.TinyInt
                    year              Int      @db.Year
                    unsignedInt       Int      @db.UnsignedInt
                    unsignedSmallInt  Int      @db.UnsignedSmallInt
                    unsignedMediumInt Int      @db.UnsignedMediumInt
                    unsignedTinyInt   Int      @db.UnsignedTinyInt

                    bigInt            BigInt   @db.BigInt
                    unsignedBigInt    BigInt   @db.UnsignedBigInt

                    float             Float    @db.Float
                    double            Float    @db.Double
                    decimalFloat      Float    @db.Decimal(10, 2)
                    decimal           Decimal  @db.Decimal(10, 2)

                    timestamp         DateTime @db.Timestamp(6)
                    datetime          DateTime @db.DateTime(6)
                    date              DateTime @db.Date
                    time              DateTime @db.Time(6)

                    json              Json     @db.Json

                    longBlob          Bytes    @db.LongBlob
                    blob              Bytes    @db.Blob
                    mediumBlob        Bytes    @db.MediumBlob
                    tinyBlob          Bytes    @db.TinyBlob
                    binary            Bytes    @db.Binary(16)
                    varBinary         Bytes    @db.VarBinary(255)
                }
                `,
                );
            });

            it('rejects postgresql attributes', async () => {
                await loadSchemaWithError(
                    `
                datasource db {
                    provider = 'mysql'
                    url      = env('DATABASE_URL')
                }

                model User {
                    id String @id @db.Uuid
                }
                `,
                    `attribute "@db.Uuid" cannot be used with the "mysql" provider`,
                );
            });
        });
    });

    it('requires relation and fk to have consistent optionality', async () => {
        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model Foo {
                id Int @id @default(autoincrement())
                bar Bar @relation(fields: [barId], references: [id])
                barId Int?
                @@allow('all', true)
            }

            model Bar {
                id Int @id @default(autoincrement())
                foos Foo[]
                @@allow('all', true)
            }
            `,
            /relation "bar" is not optional/,
        );
    });
});
