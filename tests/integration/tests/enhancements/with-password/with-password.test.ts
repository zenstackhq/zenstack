import { loadSchema } from '@zenstackhq/testtools';
import { compareSync } from 'bcryptjs';
import path from 'path';

describe('Password test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('password tests', async () => {
        const { enhance, prisma } = await loadSchema(`
    model User {
        id String @id @default(cuid())
        password String @password(saltLength: 16)
    
        @@allow('all', true)
    }`);

        const db = enhance();
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

        await db.user.createMany({
            data: [
                { id: '2', password: 'user2' },
                { id: '3', password: 'user3' },
            ],
        });
        await expect(prisma.user.findUnique({ where: { id: '2' } })).resolves.not.toMatchObject({ password: 'user2' });
        const r2 = await db.user.findUnique({ where: { id: '2' } });
        expect(compareSync('user2', r2.password)).toBeTruthy();

        const [u4] = await db.user.createManyAndReturn({
            data: [
                { id: '4', password: 'user4' },
                { id: '5', password: 'user5' },
            ],
        });
        expect(compareSync('user4', u4.password)).toBeTruthy();
        await expect(prisma.user.findUnique({ where: { id: '4' } })).resolves.not.toMatchObject({ password: 'user4' });
        const r4 = await db.user.findUnique({ where: { id: '4' } });
        expect(compareSync('user4', r4.password)).toBeTruthy();
    });

    it('length tests', async () => {
        const { enhance } = await loadSchema(`
    model User {
        id String @id @default(cuid())
        password String @password(saltLength: 16) @length(1, 8) @startsWith('abc')
    
        @@allow('all', true)
    }`);

        const db = enhance();
        let r = await db.user.create({
            data: {
                id: '1',
                password: 'abc123',
            },
        });
        expect(compareSync('abc123', r.password)).toBeTruthy();

        r = await db.user.update({
            where: { id: '1' },
            data: {
                password: 'abc456',
            },
        });
        expect(compareSync('abc456', r.password)).toBeTruthy();

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    password: 'abc456789',
                },
            })
        ).toBeRejectedByPolicy(['8 character']);

        await expect(
            db.user.create({
                data: {
                    id: '2',
                    password: 'abc456789',
                },
            })
        ).toBeRejectedByPolicy(['8 character']);

        await expect(
            db.user.create({
                data: {
                    id: '2',
                    password: '123456',
                },
            })
        ).toBeRejectedByPolicy(['must start with "abc" at "password"']);
    });

    it('prevents query enumeration if password is not readable', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id       Int    @id @default(autoincrement())
                email    String @unique
                password String @password @omit @deny('read', true)
                @@allow('all', true)
            }
            `
        );

        const db = enhance();

        const user = await db.user.create({
            data: {
                email: 'alice@abc.com',
                password: '123456',
            },
        });
        expect(user.password).toBeUndefined();

        const u = await prisma.user.findFirstOrThrow();

        await expect(db.user.findFirst({ where: { password: u.password } })).toResolveNull();
        await expect(
            db.user.findFirst({
                where: { password: { startsWith: u?.password.substring(0, 3) } },
            })
        ).toResolveNull();
    });
});
