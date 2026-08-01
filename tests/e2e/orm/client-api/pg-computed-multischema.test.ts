import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Postgres multi-schema with computed fields', () => {
    it('supports computed fields on models in custom schemas', async () => {
        const db = await createTestClient(
            `
            datasource db {
                provider = "postgresql"
                url = '$DB_URL'
                schemas = ["public", "mySchema1", "mySchema2"]
            }

            model Author {
                id    Int    @id @default(autoincrement())
                name  String
                books Book[]
                @@schema("mySchema1")
            }

            model Book {
                id       Int    @id @default(autoincrement())
                title    String
                authorId Int
                author   Author @relation(fields: [authorId], references: [id])
                authorName String @computed()
                @@schema("mySchema2")
            }
            `,
            {
                provider: 'postgresql',
                usePrismaPush: true,
                computedFields: {
                    Book: {
                        authorName: (eb: any) =>
                            eb
                                .selectFrom('mySchema1.Author')
                                .select('Author.name')
                                .whereRef('Author.id', '=', 'authorId')
                                .limit(1),
                    },
                },
            } as any,
        );

        // Create author and book
        const author = await db.author.create({ data: { name: 'Jane Doe' } });
        const book = await db.book.create({ data: { title: 'ZenStack Guide', authorId: author.id } });

        // Fetch book and check computed field
        const fetched = await db.book.findUnique({ where: { id: book.id } });
        expect(fetched?.authorName).toBe('Jane Doe');
    });
});
