import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1857', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
            type JSONContent {
                type String
                text String?
            }

            model Post {
                id String @id @default(uuid())
                content JSONContent @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
            import { PrismaClient } from '@prisma/client';
            import { enhance } from '.zenstack/enhance';
            
            async function main() {
                const prisma = new PrismaClient();
                await prisma.post.create({
                    data: {
                        content: { type: 'foo', text: null }
                    }
                });
            }
                `,
                    },
                ],
            }
        );

        zodSchemas.models.JSONContentSchema.parse({ type: 'foo', text: null });
    });
});
