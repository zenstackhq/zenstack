import { loadSchema } from '@zenstackhq/testtools';

describe('V2 Polymorphism Test', () => {
    it('test', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                assets Asset[]

                @@allow('all', true)
            }

            model Asset {
                id Int @id @default(autoincrement())
                createdAt DateTime @default(now())
                viewCount Int @default(0)
                owner User @relation(fields: [ownerId], references: [id])
                ownerId Int
                // type String @discriminator
                
                @@delegate
            }
            
            model Video extends Asset {
                duration Int
                url String

                @@allow('all', true)
            }
            `
        );

        const db = enhance();

        await db.user.create({
            data: {
                id: 1,
            },
        });

        // await await db.video.create({
        //     data: { ownerId: 1, duration: 100, url: 'xyz' },
        // });
    });
});
