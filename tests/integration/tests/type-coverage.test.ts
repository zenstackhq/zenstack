import path from 'path';
import { makeClient, run, setup } from './utils';
import { ServerErrorCode } from '../../../packages/internal/src/types';

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
        const data = {
            string: 'string',
            int: 100,
            bigInt: 9007199254740991,
            date: new Date(),
            float: 1.23,
            decimal: 1.2345,
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
                expect(resp.body.bigInt).toEqual(
                    expect.objectContaining({
                        type: 'BigInt',
                        data: data.bigInt.toString(),
                    })
                );

                expect(resp.body.date).toEqual(
                    expect.objectContaining({
                        type: 'Date',
                        data: data.date.toISOString(),
                    })
                );

                expect(resp.body.decimal).toEqual(
                    expect.objectContaining({
                        type: 'Decimal',
                        data: data.decimal.toString(),
                    })
                );

                expect(resp.body.bytes).toEqual(
                    expect.objectContaining({
                        type: 'Bytes',
                        data: Array.from(data.bytes),
                    })
                );
            });
    });
});
