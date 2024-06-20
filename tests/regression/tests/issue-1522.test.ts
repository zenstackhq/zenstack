import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1522', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Course {
                id          String       @id @default(uuid())
                title       String
                description String
                sections    Section[]
                activities  Activity[]
                @@allow('all', true)
            }

            model Section {
                id         String     @id @default(uuid())
                title      String
                courseId   String     
                idx        Int        @default(0)
                course     Course     @relation(fields: [courseId], references: [id])
                activities Activity[]
            }

            model Activity {
                id        String       @id @default(uuid())
                title     String
                courseId  String       
                sectionId String       
                idx       Int          @default(0)
                type      String
                course    Course       @relation(fields: [courseId], references: [id])
                section   Section      @relation(fields: [sectionId], references: [id])
                @@delegate(type)
            }

            model UrlActivity extends Activity {
                url     String
            }

            model TaskActivity extends Activity {
                description String
            }
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        const course = await db.course.create({
            data: {
                title: 'Test Course',
                description: 'Description of course',
                sections: {
                    create: {
                        id: '00000000-0000-0000-0000-000000000002',
                        title: 'Test Section',
                        idx: 0,
                    },
                },
            },
            include: {
                sections: true,
            },
        });

        const section = course.sections[0];
        await db.taskActivity.create({
            data: {
                title: 'Test Activity',
                description: 'Description of task',
                idx: 0,
                courseId: course.id,
                sectionId: section.id,
            },
        });

        const found = await db.course.findFirst({
            where: { id: course.id },
            include: {
                sections: {
                    orderBy: { idx: 'asc' },
                    include: {
                        activities: { orderBy: { idx: 'asc' } },
                    },
                },
            },
        });

        expect(found.sections[0].activities[0]).toMatchObject({
            description: 'Description of task',
        });
    });
});
