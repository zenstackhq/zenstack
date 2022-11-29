import { loadModel, loadModelWithError } from '../../utils';

describe('Attribute tests', () => {
    const prelude = `
        datasource db {
            provider = "postgresql"
            url = "url"
        }
    `;

    it('builtin field attributes', async () => {
        await loadModel(`
            ${prelude}
            model M {
                x String @id @default("abc") @unique @map("_id")
                y DateTime @updatedAt
            }
        `);
    });

    it('field attribute type checking', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id(123)
            }
        `)
        ).toContain(`Unexpected unnamed argument`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default(value:'def', 'abc')
            }
        `)
        ).toContain(`Unexpected unnamed argument`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default('abc', value:'def')
            }
        `)
        ).toContain(`Parameter "value" is already provided`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default(123)
            }
        `)
        ).toContain(`Value is not assignable to parameter`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default()
            }
        `)
        ).toContain(`Required parameter not provided: value`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default('abc', value: 'def')
            }
        `)
        ).toContain(`Parameter "value" is already provided`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id() @default(foo: 'abc')
            }
        `)
        ).toContain(
            `Attribute "@default" doesn't have a parameter named "foo"`
        );
    });

    it('field attribute coverage', async () => {
        await loadModel(`
            ${prelude}
            model A {
                id String @id
            }

            model B {
                id String @id()
            }

            model C {
                id String @id(map: "__id")
            }

            model D {
                id String @id
                x String @default("x")
            }

            model E {
                id String @id
                x String @default(value: "x")
            }

            model F {
                id String @id
                x String @default(uuid())
            }

            model G {
                id String @id
                x Int @default(autoincrement())
            }

            model H {
                id String @id
                x String @unique()
            }
        `);
    });

    it('model attribute coverage', async () => {
        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique([x, y])
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique(fields: [x, y])
            }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@unique([x, z])
            }
        `)
        ).toContain(
            `Could not resolve reference to ReferenceTarget named 'z'.`
        );

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@index([x, y])
            }
        `);

        await loadModel(`
            ${prelude}
            model A {
                id String @id
                x Int
                y String
                @@map("__A")
            }
        `);
    });

    it('attribute function coverage', async () => {
        await loadModel(`
            ${prelude}
            model User { id String @id }

            model A {
                id String @id @default(uuid())
                id1 String @default(cuid())
                created DateTime @default(now())
                serial Int @default(autoincrement())
                foo String @default(dbgenerated("gen_random_uuid()"))
                @@allow('all', auth() != null)
            }
        `);
    });

    it('attribute function check', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id @default(foo())
            }
        `)
        ).toContain(`Could not resolve reference to Function named 'foo'.`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id Int @id @default(uuid())
            }
        `)
        ).toContain(`Value is not assignable to parameter`);
    });

    it('auth function check', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}

            model Post {
                id String @id
                @@allow('all', auth() != null)
            }
        `)
        ).toContain(
            `auth() cannot be resolved because no "User" model is defined`
        );

        await loadModel(`
            ${prelude}

            model User {
                id String @id
                name String
            }

            model Post {
                id String @id
                @@allow('all', auth().name != null)
            }
        `);

        expect(
            await loadModelWithError(`
            ${prelude}

            model User {
                id String @id
                name String
            }

            model Post {
                id String @id
                @@allow('all', auth().email != null)
            }
        `)
        ).toContain(
            `Could not resolve reference to DataModelField named 'email'.`
        );
    });

    it('invalid attribute target field', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id @gt(10)
            }
        `)
        ).toContain('attribute "@gt" cannot be used on this type of field');

        expect(
            await loadModelWithError(`
            ${prelude}
            model A {
                id String @id
                x Int @length(5)
            }
        `)
        ).toContain('attribute "@length" cannot be used on this type of field');
    });
});
