import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Enum tests', () => {
    describe('implicit array conversions', () => {
        it('supports usage with policy and validation attributes', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                enum PostStatus {
                    DRAFT
                    ACTIVE
                    CANCELLED
                }

                model User {
                    id Int @id @default(autoincrement())
                }

                model Post {
                    id     String @id
                    status String @allow('update', status in PostStatus) @deny('read', !(status in PostStatus))

                    @@allow('read', status in PostStatus)
                    @@deny('read', status in PostStatus)
                    @@validate(status in PostStatus)
                }
            `);
        });

        it('rejects usage with non-policy and non-validation attributes', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                enum PostStatus {
                    DRAFT
                    ACTIVE
                    CANCELLED
                }

                model User {
                    id Int @id @default(autoincrement())
                }

                model Post {
                    id     String @id
                    status PostStatus[] @default(PostStatus)
                }
            `,
                /Enum reference can only be used with policy and validation attributes/,
            );
        });

        it('rejects usage in other contexts', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                enum PostStatus {
                    DRAFT
                    ACTIVE
                    CANCELLED
                }

                model User {
                    id Int @id @default(autoincrement())
                }

                model Post {
                    id     String @id
                    status String
                }

                function Test(status: String): Void {
                    status in PostStatus
                }
            `,
                /Enum reference can only be used with policy and validation attributes/,
            );
        });
    });
});
