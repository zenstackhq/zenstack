import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2104', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            tickets TicketInPost[]
            @@allow('all', true)
        }

        model View {
            id Int @id @default(autoincrement())
            ability String
            tickets TicketInPost[]
            @@allow('all', true)
        }

        model TicketInPost {
            id Int @id @default(autoincrement())
            postId Int
            post Post @relation(fields: [postId], references: [id])
            viewId Int
            view View @relation(fields: [viewId], references: [id])
            @@allow('all', true)
        }
            `,
            { logPrismaQuery: true, enhancements: ['policy', 'delegate'] }
        );

        const db = enhance();
        const view = await db.view.create({ data: { ability: 'bla' } });
        const post = await db.post.create({ data: {} });
        const updatedPost = await db.post.update({
            where: {
                id: post.id,
            },
            data: {
                tickets: {
                    deleteMany: {},
                    create: {
                        viewId: view.id,
                    },
                },
            },
            include: {
                tickets: true,
            },
        });
        console.log('created!', updatedPost);
    });
});
