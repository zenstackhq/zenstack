import { AuthUser } from '@zenstackhq/runtime';
import { compareSync } from 'bcryptjs';
import path from 'path';
import { WeakDbClientContract, loadPrismaFromModelFile, run } from '../../utils';

describe('Todo Presets Tests', () => {
    let getDb: (user?: AuthUser) => WeakDbClientContract;
    let prisma: WeakDbClientContract;

    beforeAll(async () => {
        const { withPresets, prisma: _prisma } = await loadPrismaFromModelFile(
            'todo-presets',
            path.join(__dirname, '../schema/todo.zmodel')
        );
        getDb = withPresets;
        prisma = _prisma;
    });

    beforeEach(() => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    it('user', async () => {
        const anonDb = getDb();
        const user1Db = getDb({ id: 'user1' });

        await expect(anonDb.user.create({ data: { email: 'abc.xyz' } })).toBeRejectedByPolicy(['Invalid email']);

        const r = await user1Db.user.create({ data: { id: 'user1', email: 'abc@xyz.com', password: 'abc123' } });
        expect(r.password).toBeUndefined();
        const full = await prisma.user.findUnique({ where: { id: 'user1' } });
        expect(compareSync('abc123', full.password)).toBe(true);

        await expect(anonDb.user.findUnique({ where: { id: 'user1' } })).toResolveNull();
    });
});
