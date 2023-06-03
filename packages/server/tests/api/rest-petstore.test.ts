/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { loadSchema, run } from '@zenstackhq/testtools';
import { ModelMeta } from '@zenstackhq/runtime/enhancements/types';
import makeHandler from '../../src/api/rest';
import { Response } from '../../src/types';

let prisma: any;
let zodSchemas: any;
let modelMeta: ModelMeta;
let db: any;
let handler: (any: any) => Promise<Response>;

describe('REST server tests - Pet Store API', () => {
    const schema = `
    model User {
        id String @id @default(cuid())
        email String @unique
        orders Order[]
    
        // everybody can signup
        @@allow('create', true)
    
        // user profile is publicly readable
        @@allow('read', true)
    }
    
    model Pet {
        id String @id @default(cuid())
        createdAt DateTime @default(now())
        updatedAt DateTime @updatedAt
        name String
        category String
        order Order? @relation(fields: [orderId], references: [id])
        orderId String?
    
        // unsold pets are readable to all; sold ones are readable to buyers only
        @@allow('read', orderId == null || order.user == auth())
    
        // only allow update to 'orderId' field if it's not set yet (unsold)
        @@allow('update', name == future().name && category == future().category && orderId == null )
    }
    
    model Order {
        id String @id @default(cuid())
        createdAt DateTime @default(now())
        updatedAt DateTime @updatedAt
        pets Pet[]
        user User @relation(fields: [userId], references: [id])
        userId String
    
        // users can read their orders
        @@allow('read,create', auth() == user)
    }
    `;

    beforeAll(async () => {
        const params = await loadSchema(schema);

        prisma = params.prisma;
        db = params.withPresets({ id: 'user1' });
        zodSchemas = params.zodSchemas;
        modelMeta = params.modelMeta;

        const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
        handler = (args) => _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
    });

    beforeEach(async () => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');

        const petData = [
            {
                id: 'luna',
                name: 'Luna',
                category: 'kitten',
            },
            {
                id: 'max',
                name: 'Max',
                category: 'doggie',
            },
            {
                id: 'cooper',
                name: 'Cooper',
                category: 'reptile',
            },
        ];

        for (const pet of petData) {
            await prisma.pet.create({ data: pet });
        }

        await prisma.user.create({ data: { id: 'user1', email: 'user1@abc.com' } });
    });

    it('crud test', async () => {
        const r = await handler({
            method: 'post',
            path: '/order',
            prisma: db,
            requestBody: {
                data: {
                    type: 'order',
                    relationships: {
                        user: { data: { type: 'user', id: 'user1' } },
                        pets: { data: [{ type: 'pet', id: 'luna' }] },
                    },
                },
            },
        });
        expect(r.status).toBe(201);
        expect((r.body as any).data.relationships.user.data.id).toBe('user1');
        expect((r.body as any).data.relationships.pets.data[0].id).toBe('luna');
    });
});
