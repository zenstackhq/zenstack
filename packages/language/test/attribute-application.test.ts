import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Attribute application validation tests', () => {
    describe('Model-level policy attributes (@@allow, @@deny)', () => {
        it('accepts valid policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('create', true)
                    @@allow('read', true)
                    @@allow('update', true)
                    @@allow('post-update', true)
                    @@allow('delete', true)
                    @@deny('all', false)
                }
            `);
        });

        it('accepts comma-separated policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('create, read, update', true)
                    @@deny('delete, post-update', false)
                }
            `);
        });

        it('rejects invalid policy kind', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('invalid', true)
                }
                `,
                `Invalid policy rule kind`,
            );
        });

        it('rejects before in create policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('create', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('rejects before in read policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('read', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('rejects before in non-post-update policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('update', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('rejects before in delete policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('delete', before(x) > 2)
                }
                `,
                `"before()" is only allowed in "post-update" policy rules`,
            );
        });

        it('accepts before in post-update policies', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int
                    @@allow('all', true)
                    @@deny('post-update', before().x > 2)
                }
            `);
        });

        it('rejects non-owned relation in create policy', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('create', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
                `,
                `non-owned relation fields are not allowed in "create" rules`,
            );
        });

        it('rejects non-owned relation in all policy', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('all', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
                `,
                `non-owned relation fields are not allowed in "create" rules`,
            );
        });

        it('accepts owned relation in create policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bar Bar @relation(fields: [barId], references: [id])
                    barId Int
                    @@allow('create', bar.x > 0)
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foos Foo[]
                    @@allow('all', true)
                }
            `);
        });

        it('accepts non-owned relation in read policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('read', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
            `);
        });

        it('accepts non-owned relation in update policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bars Bar[]
                    @@allow('update', bars?[x > 0])
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    x Int
                    foo Foo @relation(fields: [fooId], references: [id])
                    fooId Int
                    @@allow('all', true)
                }
            `);
        });

        it('accepts auth() relation access in create policy', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id Int @id @default(autoincrement())
                    posts Post[]
                    @@allow('all', true)
                    @@auth()
                }

                model Post {
                    id Int @id @default(autoincrement())
                    author User @relation(fields: [authorId], references: [id])
                    authorId Int
                    @@allow('create', auth().posts?[id > 0])
                }
            `);
        });
    });

    describe('Field-level policy attributes (@allow, @deny)', () => {
        it('accepts valid field-level policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @allow('read', true)
                    y  Int @allow('update', true)
                    z  Int @deny('all', false)
                    @@allow('all', true)
                }
            `);
        });

        it('accepts comma-separated field-level policy kinds', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @allow('read, update', true)
                    @@allow('all', true)
                }
            `);
        });

        it('rejects before in field-level policies', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @deny('update', before(x) > 2)
                    @@allow('all', true)
                }
                `,
                `"before()" is not allowed in field-level policies`,
            );
        });

        it('rejects field-level policy on relation fields', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    bar Bar @relation(fields: [barId], references: [id]) @allow('read', true)
                    barId Int
                    @@allow('all', true)
                }

                model Bar {
                    id Int @id @default(autoincrement())
                    foos Foo[]
                    @@allow('all', true)
                }
                `,
                `Field-level policies are not allowed for relation fields`,
            );
        });

        it('rejects field-level policy on computed fields', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x Int
                    doubled Int @computed @allow('read', true)
                    @@allow('all', true)
                }
                `,
                `Field-level policies are not allowed for computed fields`,
            );
        });

        it('accepts field-level policy on regular fields', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Foo {
                    id Int @id @default(autoincrement())
                    x  Int @allow('read', true)
                    y  String @deny('update', false)
                    @@allow('all', true)
                }
            `);
        });

        it('accepts complex expressions in field-level policies', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model User {
                    id Int @id @default(autoincrement())
                    email String
                    posts Post[]
                    @@allow('all', true)
                    @@auth()
                }

                model Post {
                    id Int @id @default(autoincrement())
                    title String @allow('update', auth() != null && auth().id == authorId)
                    author User @relation(fields: [authorId], references: [id])
                    authorId Int
                    @@allow('all', true)
                }
            `);
        });
    });

    describe('Partial index where argument', () => {
        const header = `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }
        `;

        it('accepts a filter object in @@index', async () => {
            await loadSchema(`${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@index([email], where: { email: { not: null } })
                }
            `);
        });

        it('accepts raw() in @@index', async () => {
            await loadSchema(`${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@index([email], where: raw("email IS NOT NULL"))
                }
            `);
        });

        it('accepts a filter object in @@unique', async () => {
            await loadSchema(`${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@unique([email], where: { email: { not: null } })
                }
            `);
        });

        it('accepts raw() in @@unique', async () => {
            await loadSchema(`${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@unique([email], where: raw("email IS NOT NULL"))
                }
            `);
        });

        it('rejects a plain string literal in @@index', async () => {
            await loadSchemaWithError(
                `${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@index([email], where: "email IS NOT NULL")
                }
                `,
                '`where` expects a filter object or raw("SQL")',
            );
        });

        it('rejects a plain string literal in @@unique', async () => {
            await loadSchemaWithError(
                `${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@unique([email], where: "email IS NOT NULL")
                }
                `,
                '`where` expects a filter object or raw("SQL")',
            );
        });

        it('rejects a numeric literal in @@index', async () => {
            await loadSchemaWithError(
                `${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@index([email], where: 42)
                }
                `,
                '`where` expects a filter object or raw("SQL")',
            );
        });

        it('rejects a bare field reference in @@index', async () => {
            await loadSchemaWithError(
                `${header}
                model Foo {
                    id    Int     @id @default(autoincrement())
                    email String?
                    @@index([email], where: email)
                }
                `,
                '`where` expects a filter object or raw("SQL")',
            );
        });
    });

    it('requires relation and fk to have consistent optionality', async () => {
        await loadSchemaWithError(
            `
            datasource db {
                provider = 'sqlite'
                url      = 'file:./dev.db'
            }

            model Foo {
                id Int @id @default(autoincrement())
                bar Bar @relation(fields: [barId], references: [id])
                barId Int?
                @@allow('all', true)
            }

            model Bar {
                id Int @id @default(autoincrement())
                foos Foo[]
                @@allow('all', true)
            }
            `,
            /relation "bar" is not optional/,
        );
    });
});
