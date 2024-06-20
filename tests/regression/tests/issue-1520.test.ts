import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1520', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Course {
                id        Int      @id @default(autoincrement())
                title String
                addedToNotifications AddedToCourseNotification[]
            }

            model Group {
                id        Int      @id @default(autoincrement())
                addedToNotifications AddedToGroupNotification[]
            }

            model Notification {
                id         Int              @id @default(autoincrement())
                createdAt  DateTime         @default(now())
                type       String
                senderId   Int
                receiverId Int
                @@delegate (type)
            }

            model AddedToGroupNotification extends Notification {
                groupId Int   
                group   Group @relation(fields: [groupId], references: [id], onDelete: Cascade)
            }

            model AddedToCourseNotification extends Notification {
                courseId Int    
                course   Course @relation(fields: [courseId], references: [id], onDelete: Cascade)
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const r = await db.course.create({
            data: {
                title: 'English classes',
                addedToNotifications: {
                    createMany: {
                        data: [
                            {
                                id: 1,
                                receiverId: 1,
                                senderId: 2,
                            },
                        ],
                    },
                },
            },
            include: { addedToNotifications: true },
        });

        expect(r.addedToNotifications).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 1,
                    courseId: 1,
                    receiverId: 1,
                    senderId: 2,
                }),
            ])
        );
    });
});
