import path from 'path';
import { makeClient, run, setup } from './utils';
import { Decimal } from 'decimal.js';

describe('Type Coverage Tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
        await setup('./tests/type-coverage.zmodel');
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
    });

    it('all types', async () => {
        const date = new Date();
        const data = {
            string: 'string',
            int: 100,
            bigInt: BigInt(9007199254740991),
            date,
            float: 1.23,
            decimal: new Decimal(1.2345),
            boolean: true,
            bytes: Buffer.from('hello'),
        };
        await makeClient('/api/data/Foo')
            .post('/')
            .send({
                data,
            })
            .expect(201)
            .expect((resp) => {
                expect(resp.body).toEqual(expect.objectContaining(data));
            });
    });
});
