import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2007', () => {
    it('regression1', async () => {
        const { enhance } = await loadSchema(
            `
            model Page {
                id String @id @default(cuid())
                title String
                
                images Image[]
                
                @@allow('all', true)
            }

            model Image {
                id String @id @default(cuid()) @deny('update', true)
                url String
                pageId String?
                page Page? @relation(fields: [pageId], references: [id])
                
                @@allow('all', true)
            }
            `
        );

        const db = enhance();

        const image = await db.image.create({
            data: {
                url: 'https://example.com/image.png',
            },
        });

        await expect(
            db.image.update({
                where: { id: image.id },
                data: {
                    page: {
                        create: {
                            title: 'Page 1',
                        },
                    },
                },
            })
        ).toResolveTruthy();
    });

    it('regression2', async () => {
        const { enhance } = await loadSchema(
            `
            model Page {
                id String @id @default(cuid())
                title String
                
                images Image[]
                
                @@allow('all', true)
            }

            model Image {
                id String @id @default(cuid())
                url String
                pageId String? @deny('update', true)
                page Page? @relation(fields: [pageId], references: [id])
                
                @@allow('all', true)
            }
            `
        );

        const db = enhance();

        const image = await db.image.create({
            data: {
                url: 'https://example.com/image.png',
            },
        });

        await expect(
            db.image.update({
                where: { id: image.id },
                data: {
                    page: {
                        create: {
                            title: 'Page 1',
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });
});
