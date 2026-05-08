/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { type ModelMeta } from '@zenstackhq/runtime';
import { loadSchema, run } from '@zenstackhq/testtools';
import makeHandler from '../../src/api/rest';

describe('REST server tests - pagination over 100', () => {
    let prisma: any;
    let zodSchemas: any;
    let modelMeta: ModelMeta;
    let handler: (any: any) => Promise<{ status: number; body: any }>;

    beforeEach(async () => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    describe('REST TEMP', () => {
        const schema = `
    model User {
        myId String @id @default(cuid())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        email String @unique @email
    }
    `;

        beforeAll(async () => {
            const params = await loadSchema(schema);

            prisma = params.prisma;
            zodSchemas = params.zodSchemas;
            modelMeta = params.modelMeta;

            const _handler = makeHandler({ endpoint: 'http://localhost/api' });
            handler = (args) =>
                _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
        });

        it('returns only 15 items when limit set to 15', async () => {
            // Create users first
            for (const i of Array(150).keys()) {
                await prisma.user.create({
                    data: {
                        myId: `user${i}`,
                        email: `user${i}@abc.com`,
                    },
                });
            }

            const r = await handler({
                method: 'get',
                path: '/user',
                query: { ['page[limit]']: '15' },
                prisma,
            });
            expect(r.body.data).toHaveLength(15);
            //expect(r.body.meta.total).toBe(150);
            // expect(r.body.links).toMatchObject({
            //     first: 'http://localhost/api/user?page%5Blimit%5D=5',
            //     last: 'http://localhost/api/user?page%5Boffset%5D=145',
            //     prev: null,
            //     next: 'http://localhost/api/user?page%5Boffset%5D=5&page%5Blimit%5D=5',
            // });
        });

        it('returns 125 items when limit set to 125', async () => {
            // Create users first
            for (const i of Array(150).keys()) {
                await prisma.user.create({
                    data: {
                        myId: `user${i}`,
                        email: `user${i}@abc.com`,
                    },
                });
            }

            const r = await handler({
                method: 'get',
                path: '/user',
                query: { ['page[limit]']: '125' },
                prisma,
            });
            expect(r.body.data).toHaveLength(125);
            //expect(r.body.meta.total).toBe(150);
            // expect(r.body.links).toMatchObject({
            //     first: 'http://localhost/api/user?page%5Blimit%5D=5',
            //     last: 'http://localhost/api/user?page%5Boffset%5D=145',
            //     prev: null,
            //     next: 'http://localhost/api/user?page%5Boffset%5D=5&page%5Blimit%5D=5',
            // });
        });
    });
});
