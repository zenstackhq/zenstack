import { AuthUser } from '@zenstackhq/runtime';
import Decimal from 'decimal.js';
import superjson from 'superjson';
import { loadPrisma, MODEL_PRELUDE, run, WeakDbClientContract } from '../../utils';

describe('Type Coverage Tests', () => {
    let getDb: (user?: AuthUser) => WeakDbClientContract;
    let prisma: WeakDbClientContract;

    beforeAll(async () => {
        const { withPresets, prisma: _prisma } = await loadPrisma(
            'type-coverate',
            `
            ${MODEL_PRELUDE}
            
            model Foo {
                id String @id @default(cuid())
                
                string String
                int Int
                bigInt BigInt
                date DateTime
                float Float
                decimal Decimal
                boolean Boolean
                bytes Bytes
            
                @@allow('all', true)
            }
            `
        );
        getDb = withPresets;
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
            string: 'string',
            int: 100,
            bigInt: BigInt(9007199254740991),
            date,
            float: 1.23,
            decimal: new Decimal(1.2345),
            boolean: true,
            bytes: Buffer.from('hello'),
        };

        await db.foo.create({
            data,
        });

        const r = await db.foo.findUnique({ where: { id: '1' } });
        expect(superjson.stringify(r)).toEqual(superjson.stringify(data));
    });
});
