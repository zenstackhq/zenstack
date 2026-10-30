import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compile, createTestDb, currentProvider, runFlow, type Provider, type TestDb } from './support/harness';
import { introspectPhysicalSchema } from './support/physical-schema';

/**
 * Verifies the engine's core compatibility claim: the physical database schema it produces
 * is identical to what Prisma produces for the same schema — same types, defaults, PKs,
 * index/constraint names, and referential actions.
 *
 * Each case builds three fresh databases: one via our `db push`, one via our `migrate dev`
 * (generate + deploy), and a Prisma-built reference (`prisma db push`; Prisma's push and
 * migrate emit the same DDL for a given end state). All are deep-introspected with the same
 * normalizing introspector and compared structurally.
 *
 * The schema bodies stay in the common subset of ZModel and Prisma schema language, so a
 * single source string drives both engines.
 */

const provider: Provider = currentProvider();
const PRISMA_BIN = path.resolve(process.cwd(), 'node_modules/.bin/prisma');

const ID = 'id Int @id @default(autoincrement())';

interface ParityCase {
    name: string;

    /** Shared ZModel/Prisma schema body (the desired end state). */
    schema: string;

    /** When set, the `dev` flow first migrates to this state, then evolves to `schema`. */
    from?: string;

    /** Restrict to providers where the schema is expressible in both engines. */
    providers?: Provider[];

    /** Flows to verify (defaults to both). Evolution cases are dev-only — `db push` is name-based. */
    flows?: ('push' | 'dev')[];
}

const CASES: ParityCase[] = [
    {
        name: 'scalar types and optionality',
        schema: `model M {
            ${ID}
            s  String
            os String?
            b  Boolean
            f  Float
            bi BigInt
            d  Decimal
            dt DateTime
            by Bytes
        }`,
    },
    {
        // Prisma doesn't support Json on SQLite
        name: 'json column',
        providers: ['postgresql', 'mysql'],
        schema: `model M {
            ${ID}
            j Json
        }`,
    },
    {
        name: 'literal and timestamp defaults',
        schema: `model M {
            ${ID}
            s  String   @default("hello")
            n  Int      @default(42)
            b  Boolean  @default(true)
            f  Float    @default(1.5)
            dt DateTime @default(now())
        }`,
    },
    {
        // uuid()/cuid() are computed client-side — neither engine emits a DB default
        name: 'client-side generated defaults',
        schema: `model M {
            id Int    @id @default(autoincrement())
            u  String @default(uuid())
            c  String @default(cuid())
        }`,
    },
    {
        name: 'dbgenerated default',
        providers: ['postgresql'],
        schema: `model M {
            ${ID}
            u String @db.Uuid @default(dbgenerated("gen_random_uuid()"))
        }`,
    },
    {
        // exhaustive over the stdlib `@db.*` attributes valid on the pg connector
        // (`@db.Citext` is excluded — it requires the citext extension to be installed)
        name: 'native types (postgresql)',
        providers: ['postgresql'],
        schema: `model M {
            ${ID}
            c01 String   @db.Text
            c02 String   @db.Char(10)
            c03 String   @db.VarChar(200)
            c04 String   @db.Bit(8)
            c05 String   @db.VarBit(8)
            c06 String   @db.Uuid
            c07 String   @db.Xml
            c08 String   @db.Inet
            c09 Boolean  @db.Boolean
            c10 Int      @db.Integer
            c11 Int      @db.SmallInt
            c12 Int      @db.Oid
            c13 BigInt   @db.BigInt
            c14 Float    @db.DoublePrecision
            c15 Float    @db.Real
            c16 Decimal  @db.Decimal(10, 2)
            c17 Decimal  @db.Money
            c18 DateTime @db.Timestamp(0)
            c19 DateTime @db.Timestamptz(3)
            c20 DateTime @db.Date
            c21 DateTime @db.Time(2)
            c22 DateTime @db.Timetz(1)
            c23 Json     @db.Json
            c24 Json     @db.JsonB
            c25 Bytes    @db.ByteA
        }`,
    },
    {
        // exhaustive over the stdlib `@db.*` attributes valid on the mysql connector.
        // Boolean native types are inexpressible in the shared subset: ZModel only allows
        // `@db.Boolean` (which Prisma's mysql connector rejects), Prisma only allows
        // `@db.TinyInt(1)` (which ZModel restricts to Int fields). The *default* Boolean
        // mapping (tinyint(1)) is covered by the scalar-types case.
        name: 'native types (mysql)',
        providers: ['mysql'],
        schema: `model M {
            ${ID}
            c01 String   @db.Char(10)
            c02 String   @db.VarChar(64)
            c03 String   @db.TinyText
            c04 String   @db.Text
            c05 String   @db.MediumText
            c06 String   @db.LongText
            c09 Int      @db.Int
            c10 Int      @db.UnsignedInt
            c11 Int      @db.SmallInt
            c12 Int      @db.UnsignedSmallInt
            c13 Int      @db.MediumInt
            c14 Int      @db.UnsignedMediumInt
            c15 Int      @db.TinyInt
            c16 Int      @db.UnsignedTinyInt
            c17 Int      @db.Year
            c18 BigInt   @db.BigInt
            c19 BigInt   @db.UnsignedBigInt
            c20 Float    @db.Float
            c21 Float    @db.Double
            c22 Decimal  @db.Decimal(10, 2)
            c23 DateTime @db.Date
            c24 DateTime @db.Time(2)
            c25 DateTime @db.DateTime(1)
            c26 DateTime @db.Timestamp(4)
            c27 Json     @db.Json
            c28 Bytes    @db.Bit(8)
            c29 Bytes    @db.Binary(16)
            c30 Bytes    @db.VarBinary(32)
            c31 Bytes    @db.TinyBlob
            c32 Bytes    @db.Blob
            c33 Bytes    @db.MediumBlob
            c34 Bytes    @db.LongBlob
        }`,
    },
    {
        name: 'relations and referential actions',
        schema: `model User {
            ${ID}
            posts   Post[]
            profile Profile?
        }
        model Post {
            ${ID}
            author   User @relation(fields: [authorId], references: [id], onDelete: Cascade, onUpdate: NoAction)
            authorId Int
        }
        model Profile {
            ${ID}
            user   User @relation(fields: [userId], references: [id])
            userId Int  @unique
        }`,
    },
    {
        name: 'keys and indexes',
        schema: `model M {
            a Int
            b Int
            c String
            d String

            @@id([a, b])
            @@unique([c, d])
            @@index([d])
        }
        model N {
            ${ID}
            e String @unique
        }`,
    },
    {
        name: 'name mapping',
        schema: `model M {
            id Int    @id @map("mid")
            s  String @map("sval")

            @@map("m_table")
            @@index([s], map: "custom_idx")
        }`,
    },
    {
        // Prisma doesn't support enums on SQLite
        name: 'enums',
        providers: ['postgresql', 'mysql'],
        schema: `enum Role {
            USER
            ADMIN
        }
        model M {
            ${ID}
            role Role @default(USER)
        }`,
    },
    {
        name: 'evolved schema converges to a fresh Prisma build',
        flows: ['dev'],
        from: `model M { ${ID}  s String }`,
        schema: `model M {
            ${ID}
            s String @default("x")
            n Int?

            @@index([s])
        }`,
    },
    {
        name: 'evolved relation converges to a fresh Prisma build',
        flows: ['dev'],
        from: `model User { ${ID} }
        model Post { ${ID}  title String }`,
        schema: `model User {
            ${ID}
            posts Post[]
        }
        model Post {
            ${ID}
            title    String
            author   User? @relation(fields: [authorId], references: [id])
            authorId Int?
        }`,
    },
];

/** Builds the Prisma reference database by running `prisma db push` on a fresh database. */
async function buildPrismaReference(schemaBody: string): Promise<TestDb> {
    const db = await createTestDb(provider);
    const schemaFile = path.join(db.workDir, 'schema.prisma');
    const datasource = `datasource db {\n  provider = "${provider}"\n  url = env("DATABASE_URL")\n}\n\n`;
    fs.writeFileSync(schemaFile, datasource + schemaBody);
    execSync(`"${PRISMA_BIN}" db push --schema="${schemaFile}" --skip-generate`, {
        // strip driver-specific query params (e.g. connectionLimit) Prisma doesn't accept
        env: { ...process.env, DATABASE_URL: db.url.split('?')[0]! },
        stdio: 'pipe',
    });
    return db;
}

describe(`prisma physical-schema parity (${provider})`, () => {
    for (const c of CASES) {
        const applicable = !c.providers || c.providers.includes(provider);
        describe.runIf(applicable)(c.name, () => {
            for (const flow of c.flows ?? (['push', 'dev'] as const)) {
                it(flow, async () => {
                    const ours = await createTestDb(provider);
                    let ref: TestDb | undefined;
                    try {
                        const from = c.from ? await compile(c.from, provider) : undefined;
                        await runFlow(ours, flow, from, await compile(c.schema, provider));
                        ref = await buildPrismaReference(c.schema);

                        const ourSchema = await introspectPhysicalSchema(ours);
                        const refSchema = await introspectPhysicalSchema(ref);
                        expect(ourSchema).toEqual(refSchema);
                    } finally {
                        await ours.cleanup();
                        await ref?.cleanup();
                    }
                });
            }
        });
    }
});
