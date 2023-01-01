import { MODEL_PRELUDE, loadPrisma } from '../../utils/utils';
import path from 'path';

describe('Omit test', () => {
    let origDir: string;
    const suite = 'omit';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('omit tests', async () => {
        const { withOmit } = await loadPrisma(
            `${suite}/test`,
            `
        ${MODEL_PRELUDE}

        model User {
            id String @id @default(cuid())
            password String @omit
            profile Profile?
        
            @@allow('all', true)
        }
        
        model Profile {
            id String @id @default(cuid())
            user User @relation(fields: [userId], references: [id])
            userId String @unique
            image String @omit
        
            @@allow('all', true)
        }        `
        );

        const db = withOmit();
        const r = await db.user.create({
            include: { profile: true },
            data: {
                id: '1',
                password: 'abc123',
                profile: {
                    create: {
                        image: 'an image',
                    },
                },
            },
        });
        expect(r.password).toBeUndefined();
        expect(r.profile.image).toBeUndefined();

        const r1 = await db.user.findUnique({
            where: { id: '1' },
            include: { profile: true },
        });
        expect(r1.password).toBeUndefined();
        expect(r1.profile.image).toBeUndefined();

        await db.user.create({
            include: { profile: true },
            data: {
                id: '2',
                password: 'abc234',
                profile: {
                    create: {
                        image: 'another image',
                    },
                },
            },
        });

        const r2 = await db.user.findMany({ include: { profile: true } });
        r2.forEach((e: any) => {
            expect(e.password).toBeUndefined();
            expect(e.profile.image).toBeUndefined();
        });
    });
});
