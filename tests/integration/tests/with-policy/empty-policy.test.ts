import { expectNotFound, expectPolicyDeny, loadPrisma } from '../utils';
import path from 'path';
import { MODEL_PRELUDE } from '../common';

describe('Operation Coverage: empty policy', () => {
    let origDir: string;
    const suite = 'empty-policy';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('direct operations', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/direct operations`,
            `
        ${MODEL_PRELUDE}

        model Model {
            id String @id @default(uuid())
        }
        `
        );

        const db = withPolicy();

        expect(await db.model.findMany()).toHaveLength(0);
        expect(await db.model.findUnique({ where: { id: '1' } })).toBeNull();
        expect(await db.model.findFirst({ where: { id: '1' } })).toBeNull();
        await expectNotFound(() =>
            db.model.findUniqueOrThrow({ where: { id: '1' } })
        );
        await expectNotFound(() =>
            db.model.findFirstOrThrow({ where: { id: '1' } })
        );

        await expectPolicyDeny(() => db.model.create({ data: {} }));
        await expectPolicyDeny(() => db.model.createMany({ data: [{}] }));

        await expectPolicyDeny(() =>
            db.model.update({ where: { id: '1' }, data: {} })
        );
        await expectPolicyDeny(() => db.model.updateMany({ data: {} }));
        await expectPolicyDeny(() =>
            db.model.upsert({
                where: { id: '1' },
                create: {},
                update: {},
            })
        );

        await expectPolicyDeny(() => db.model.delete({ where: { id: '1' } }));
        await expectPolicyDeny(() => db.model.deleteMany());

        await expectPolicyDeny(() => db.model.aggregate({}));
        await expectPolicyDeny(() => db.model.groupBy({}));
        await expectPolicyDeny(() => db.model.count());
    });

    it('to-many write', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/to-many write`,
            `
        ${MODEL_PRELUDE}

        model M1 {
            id String @id @default(uuid())
            m2 M2[]
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String
        }
        `
        );

        const db = withPolicy();

        await expectPolicyDeny(() =>
            db.m1.create({
                data: {
                    m2: {
                        create: [{}],
                    },
                },
            })
        );
    });

    it('to-one write', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/nested write to-one`,
            `
        ${MODEL_PRELUDE}

        model M1 {
            id String @id @default(uuid())
            m2 M2?
        
            @@allow('all', true)
        }
        
        model M2 {
            id String @id @default(uuid())
            m1 M1 @relation(fields: [m1Id], references:[id])
            m1Id String @unique
        }
        `
        );

        const db = withPolicy();

        await expectPolicyDeny(() =>
            db.m1.create({
                data: {
                    m2: {
                        create: {},
                    },
                },
            })
        );
    });
});
