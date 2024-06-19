import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1518', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Activity {
                id        String       @id @default(uuid())
                title     String
                type      String
                @@delegate(type)
                @@allow('all', true)
            }

            model TaskActivity extends Activity {
                description String
                @@map("task_activity")
                @@allow('all', true)
            }
            `
        );

        const db = enhance();
        await db.taskActivity.create({
            data: {
                id: '00000000-0000-0000-0000-111111111111',
                title: 'Test Activity',
                description: 'Description of task',
            },
        });
    });
});
