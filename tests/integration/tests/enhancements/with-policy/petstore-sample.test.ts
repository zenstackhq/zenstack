import { AuthUser } from '@zenstackhq/runtime';
import { loadSchemaFromFile, run, type FullDbClientContract } from '@zenstackhq/testtools';
import path from 'path';

describe('Pet Store Policy Tests', () => {
    let getDb: (user?: AuthUser) => FullDbClientContract;
    let prisma: FullDbClientContract;

    beforeAll(async () => {
        const { enhance, prisma: _prisma } = await loadSchemaFromFile(
            path.join(__dirname, '../../schema/petstore.zmodel'),
            { addPrelude: false }
        );
        getDb = enhance;
        prisma = _prisma;
    });

    beforeEach(() => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    it('crud', async () => {
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

        const r = await getDb({ id: 'user1' }).order.create({
            include: { user: true, pets: true },
            data: {
                user: { connect: { id: 'user1' } },
                pets: { connect: [{ id: 'luna' }, { id: 'max' }] },
            },
        });

        expect(r.user.id).toBe('user1');
        expect(r.pets).toHaveLength(2);
    });
});
