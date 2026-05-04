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

    describe('Field-level @fuzzy attribute', () => {
        it('accepts @fuzzy on a String field with postgres provider', async () => {
            await loadSchema(`
                datasource db {
                    provider = 'postgresql'
                    url      = 'postgresql://localhost/test'
                }

                model Flavor {
                    id          Int     @id @default(autoincrement())
                    name        String  @fuzzy
                    description String? @fuzzy
                }
            `);
        });

        it('rejects @fuzzy with sqlite provider', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'sqlite'
                    url      = 'file:./dev.db'
                }

                model Flavor {
                    id   Int    @id @default(autoincrement())
                    name String @fuzzy
                }
                `,
                /`@fuzzy` is only supported for the `postgresql` provider/,
            );
        });

        it('rejects @fuzzy with mysql provider', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'mysql'
                    url      = 'mysql://localhost/test'
                }

                model Flavor {
                    id   Int    @id @default(autoincrement())
                    name String @fuzzy
                }
                `,
                /`@fuzzy` is only supported for the `postgresql` provider/,
            );
        });

        it('rejects @fuzzy on a non-String field', async () => {
            await loadSchemaWithError(
                `
                datasource db {
                    provider = 'postgresql'
                    url      = 'postgresql://localhost/test'
                }

                model Flavor {
                    id    Int @id @default(autoincrement())
                    count Int @fuzzy
                }
                `,
                /attribute "@fuzzy" cannot be used on this type of field/,
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
