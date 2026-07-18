import { loadSchema } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { PrismaSchemaGenerator } from '@zenstackhq/sdk';

describe('Prisma schema generation tests', () => {
    it('strips format args from id functions', async () => {
        const model = await loadSchema(`
model User {
    id       Int    @id @default(autoincrement())

    cuid     String @default(cuid())
    cuid1    String @default(cuid(1, 'cuid1_%s'))
    cuid2    String @default(cuid(2, 'cuid2_%s'))

    uuid     String @default(uuid())
    uuid4    String @default(uuid(4, 'uuid4_%s'))
    uuid7    String @default(uuid(7, 'uuid7_%s'))

    ulid     String @default(ulid())
    ulid1    String @default(ulid('ulid_%s'))

    nanoid   String @default(nanoid())
    nanoid12 String @default(nanoid(12, 'nanoid12_%s'))
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const prismaSchemaText = await generator.generate();

        expect(prismaSchemaText.includes('cuid()')).toBe(true);
        expect(prismaSchemaText.includes('cuid(1)')).toBe(true);
        expect(prismaSchemaText.includes('cuid(2)')).toBe(true);
        expect(prismaSchemaText.includes('cuid1_%s')).toBe(false);
        expect(prismaSchemaText.includes('cuid2_%s')).toBe(false);

        expect(prismaSchemaText.includes('uuid()')).toBe(true);
        expect(prismaSchemaText.includes('uuid(4)')).toBe(true);
        expect(prismaSchemaText.includes('uuid(7)')).toBe(true);
        expect(prismaSchemaText.includes('uuid4_%s')).toBe(false);
        expect(prismaSchemaText.includes('uuid7_%s')).toBe(false);

        expect(prismaSchemaText.match(/ulid\(\)/g)).toHaveLength(2);
        expect(prismaSchemaText.includes('ulid_%s')).toBe(false);

        expect(prismaSchemaText.includes('nanoid()')).toBe(true);
        expect(prismaSchemaText.includes('nanoid(12)')).toBe(true);
        expect(prismaSchemaText.includes('nanoid12_%s')).toBe(false);
    });

    it('renames native type mappings to match the datasource', async () => {
        const model = await loadSchema(`
datasource ds {
    provider = 'postgresql'
    url      = env('POSTGRES_URL')
}

model User {
    id       String   @id
    string   String   @db.Text
    boolean  Boolean  @db.Boolean
    int      Int      @db.Integer
    bigInt   BigInt   @db.BigInt
    float    Float    @db.Real
    decimal  Decimal  @db.Money
    dateTime DateTime @db.Timestamptz(3)
    json     Json     @db.JsonB
    bytes    Bytes    @db.ByteA
}
        `);

        const generator = new PrismaSchemaGenerator(model);
        const prismaSchemaText = await generator.generate();

        expect(prismaSchemaText.includes('@db.Text')).toBe(false);
        expect(prismaSchemaText.includes('@db.Boolean')).toBe(false);
        expect(prismaSchemaText.includes('@db.Integer')).toBe(false);
        expect(prismaSchemaText.includes('@db.BigInt')).toBe(false);
        expect(prismaSchemaText.includes('@db.Real')).toBe(false);
        expect(prismaSchemaText.includes('@db.Money')).toBe(false);
        expect(prismaSchemaText.includes('@db.Timestamptz(3)')).toBe(false);
        expect(prismaSchemaText.includes('@db.JsonB')).toBe(false);
        expect(prismaSchemaText.includes('@db.ByteA')).toBe(false);

        expect(prismaSchemaText.includes('@ds.Text')).toBe(true);
        expect(prismaSchemaText.includes('@ds.Boolean')).toBe(true);
        expect(prismaSchemaText.includes('@ds.Integer')).toBe(true);
        expect(prismaSchemaText.includes('@ds.BigInt')).toBe(true);
        expect(prismaSchemaText.includes('@ds.Real')).toBe(true);
        expect(prismaSchemaText.includes('@ds.Money')).toBe(true);
        expect(prismaSchemaText.includes('@ds.Timestamptz(3)')).toBe(true);
        expect(prismaSchemaText.includes('@ds.JsonB')).toBe(true);
        expect(prismaSchemaText.includes('@ds.ByteA')).toBe(true);
    });
});