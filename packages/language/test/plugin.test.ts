import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Plugin tests', () => {
    it('accepts plugins with a provider', async () => {
        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid())
            }

            plugin test {
                provider = 'test'
            }
        `,
        );
    });

    it('rejects plugins without a provider', async () => {
        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid())
            }

            plugin test {

            }
        `,
            'plugin must include a "provider" field',
        );
    });

    it('rejects plugins with an empty provider', async () => {
        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid())
            }

            plugin test {
                provider = ''
            }
        `,
            '"provider" must be set to a string literal',
        );
    });

    it('rejects plugins with a non-string provider', async () => {
        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid())
            }

            plugin test {
                provider = []
            }
        `,
            '"provider" must be set to a string literal',
        );
    });
});
