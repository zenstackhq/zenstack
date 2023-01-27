import { compareSync } from 'bcryptjs';
import { MODEL_PRELUDE, loadPrisma } from '../../utils/utils';
import path from 'path';

describe('Password test', () => {
    let origDir: string;
    const suite = 'password';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('password tests', async () => {
        const { withPassword } = await loadPrisma(
            `${suite}/test`,
            `
        ${MODEL_PRELUDE}

        model User {
            id String @id @default(cuid())
            password String @password(saltLength: 16)
        
            @@allow('all', true)
        }`
        );

        const db = withPassword();
        const r = await db.user.create({
            data: {
                id: '1',
                password: 'abc123',
            },
        });
        expect(compareSync('abc123', r.password)).toBeTruthy();

        const r1 = await db.user.update({
            where: { id: '1' },
            data: {
                password: 'abc456',
            },
        });
        expect(compareSync('abc456', r1.password)).toBeTruthy();
    });
});
