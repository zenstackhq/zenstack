import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Function Invocation Tests', () => {
    it('id functions should not require format strings', async () => {
        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid())
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(7))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(nanoid())
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(nanoid(8))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(ulid())
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(cuid())
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(cuid(2))
            }  
        `,
        );
    });

    it('id functions should allow valid format strings', async () => {
        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(7, '%s_user'))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(cuid(2, '%s'))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(ulid('user_%s'))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(nanoid(8, 'user_%s'))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(7, '\\\\%s_%s'))
            }  
        `,
        );

        await loadSchema(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(7, '%s_\\\\%s'))
            }  
        `,
        );
    });

    it('id functions should reject invalid format strings', async () => {
        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(cuid(2, ''))
            }  
        `,
            'argument must include',
        );

        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(4, '\\\\%s'))
            }  
        `,
            'argument must include',
        );

        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(4, '\\\\%s\\\\%s'))
            }  
        `,
            'argument must include',
        );

        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(uuid(7, 'user_%'))
            }  
        `,
            'argument must include',
        );

        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(nanoid(8, 'user'))
            }  
        `,
            'argument must include',
        );

        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(ulid('user_%'))
            }  
        `,
            'argument must include',
        );

        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model User {
                id String @id @default(cuid(2, 'user_%'))
            }
        `,
            'argument must include',
        );
    });

    describe('uuid() version validation', () => {
        it('should accept valid uuid versions', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(uuid(4))
                }
            `);

            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(uuid(7))
                }
            `);
        });

        it('should reject invalid uuid versions', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(uuid(1))
                }
            `,
                'first argument must be 4 or 7',
            );
        });
    });

    describe('cuid() version validation', () => {
        it('should accept valid cuid versions', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(cuid(1))
                }
            `);

            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(cuid(2))
                }
            `);
        });

        it('should reject invalid cuid versions', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(cuid(0))
                }
            `,
                'first argument must be 1 or 2',
            );
        });
    });

    describe('nanoid() length validation', () => {
        it('should accept positive nanoid lengths', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(nanoid(1))
                }
            `);

            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(nanoid(21))
                }
            `);
        });

        it('should reject non-positive nanoid lengths', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(nanoid(0))
                }
            `,
                'first argument must be a positive number',
            );

            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(nanoid(-1))
                }
            `,
                'first argument must be a positive number',
            );
        });
    });

    describe('customId() length validation', () => {
        it('should reject non-positive lengths', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id String @id @default(customId(-1))
                }
            `,
                'first argument must be a positive number',
            );
        });
    });
});
