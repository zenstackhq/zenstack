import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1080', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Project {
                id String @id @unique @default(uuid())
                Fields Field[]
            
                @@allow('all', true)
            }
            
            model Field {
                id String @id @unique @default(uuid())
                name String
                Project Project @relation(fields: [projectId], references: [id])
                projectId String
            
                @@allow('all', true)
            }
            `
        );

        const db = enhance();

        const project = await db.project.create({
            include: { Fields: true },
            data: {
                Fields: {
                    create: [{ name: 'first' }, { name: 'second' }],
                },
            },
        });

        let updated = await db.project.update({
            where: { id: project.id },
            include: { Fields: true },
            data: {
                Fields: {
                    upsert: [
                        {
                            where: { id: project.Fields[0].id },
                            create: { name: 'first1' },
                            update: { name: 'first1' },
                        },
                        {
                            where: { id: project.Fields[1].id },
                            create: { name: 'second1' },
                            update: { name: 'second1' },
                        },
                    ],
                },
            },
        });
        expect(updated).toMatchObject({
            Fields: expect.arrayContaining([
                expect.objectContaining({ name: 'first1' }),
                expect.objectContaining({ name: 'second1' }),
            ]),
        });

        updated = await db.project.update({
            where: { id: project.id },
            include: { Fields: true },
            data: {
                Fields: {
                    upsert: {
                        where: { id: project.Fields[0].id },
                        create: { name: 'first2' },
                        update: { name: 'first2' },
                    },
                },
            },
        });
        expect(updated).toMatchObject({
            Fields: expect.arrayContaining([
                expect.objectContaining({ name: 'first2' }),
                expect.objectContaining({ name: 'second1' }),
            ]),
        });

        updated = await db.project.update({
            where: { id: project.id },
            include: { Fields: true },
            data: {
                Fields: {
                    upsert: {
                        where: { id: project.Fields[0].id },
                        create: { name: 'first3' },
                        update: { name: 'first3' },
                    },
                    update: {
                        where: { id: project.Fields[1].id },
                        data: { name: 'second3' },
                    },
                },
            },
        });
        expect(updated).toMatchObject({
            Fields: expect.arrayContaining([
                expect.objectContaining({ name: 'first3' }),
                expect.objectContaining({ name: 'second3' }),
            ]),
        });

        updated = await db.project.update({
            where: { id: project.id },
            include: { Fields: true },
            data: {
                Fields: {
                    upsert: {
                        where: { id: 'non-exist' },
                        create: { name: 'third1' },
                        update: { name: 'third1' },
                    },
                    update: {
                        where: { id: project.Fields[1].id },
                        data: { name: 'second4' },
                    },
                },
            },
        });
        expect(updated).toMatchObject({
            Fields: expect.arrayContaining([
                expect.objectContaining({ name: 'first3' }),
                expect.objectContaining({ name: 'second4' }),
                expect.objectContaining({ name: 'third1' }),
            ]),
        });
    });
});
