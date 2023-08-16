import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: field-level policy', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('read', async () => {
        const { prisma, withPolicy } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
            admin Boolean @default(false)
        }
        
        model Model {
            id Int @id @default(autoincrement())
            x Int
            y Int @allow('read', x > 0 || auth().admin)

            @@allow('all', true)
        }
        `
        );

        await prisma.model.create({
            data: {
                id: 1,
                x: 0,
                y: 0,
            },
        });

        const db = withPolicy();
        const r = await db.model.findUnique({ where: { id: 1 } });
        expect(r.y).toBeUndefined();
    });
});
