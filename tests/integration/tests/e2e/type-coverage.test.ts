import { AuthUser } from '@zenstackhq/runtime';
import { loadSchema, run, type FullDbClientContract } from '@zenstackhq/testtools';
import Decimal from 'decimal.js';
import superjson from 'superjson';

describe('Type Coverage Tests', () => {
    let getDb: (user?: AuthUser) => FullDbClientContract;
    let prisma: FullDbClientContract;

    beforeAll(async () => {
        const { enhance, prisma: _prisma } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                
                String String
                Int Int
                BigInt BigInt
                DateTime DateTime
                Float Float
                Decimal Decimal
                Boolean Boolean
                Bytes Bytes
            
                @@allow('all', true)
            }
            `
        );
        getDb = enhance;
        prisma = _prisma;
    });

    beforeEach(() => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    it('coverage', async () => {
        const db = getDb();

        const date = new Date();
        const data = {
            id: '1',
            String: 'string',
            Int: 100,
            BigInt: BigInt(9007199254740991),
            DateTime: date,
            Float: 1.23,
            Decimal: new Decimal(1.2345),
            Boolean: true,
            Bytes: Buffer.from('hello'),
        };

        await db.foo.create({
            data,
        });

        const r = await db.foo.findUnique({ where: { id: '1' } });
        expect(superjson.stringify(r)).toEqual(superjson.stringify(data));
    });
});
