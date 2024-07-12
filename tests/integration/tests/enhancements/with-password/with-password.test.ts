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
        const { enhance } = await loadSchema(`
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
        ).toBeRejectedByPolicy(['String must contain at most 8 character(s) at "password"']);

        await expect(
            db.user.create({
                data: {
                    id: '2',
                    password: 'abc456789',
                },
            })
        ).toBeRejectedByPolicy(['String must contain at most 8 character(s) at "password"']);

        await expect(
            db.user.create({
                data: {
                    id: '2',
                    password: '123456',
                },
            })
        ).toBeRejectedByPolicy(['must start with "abc" at "password"']);
    });
});
