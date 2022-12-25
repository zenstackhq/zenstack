import { AuthUser } from '@zenstackhq/runtime';
import {
    WeakDbClientContract,
    expectPolicyDeny,
    loadPrismaFromModelFile,
} from '../utils';
import path from 'path';

describe('Todo E2E Tests', () => {
    let getDb: (user?: AuthUser) => WeakDbClientContract;
    let prisma: WeakDbClientContract;

    beforeAll(async () => {
        const { withPolicy, prisma: _prisma } = await loadPrismaFromModelFile(
            'todo',
            path.join(__dirname, 'todo.zmodel')
        );
        getDb = withPolicy;
        prisma = _prisma;
    });

    it('user', async () => {
        const user1 = {
            id: 'user1',
            email: 'user1@zenstack.dev',
            name: 'User 1',
        };
        const user2 = {
            id: 'user2',
            email: 'user2@zenstack.dev',
            name: 'User 2',
        };

        const anonDb = getDb();
        await expectPolicyDeny(() => anonDb.user.create({ data: user1 }));
        expect(
            await prisma.user.findUnique({ where: { id: user1.id } })
        ).toBeTruthy();
    });
});
