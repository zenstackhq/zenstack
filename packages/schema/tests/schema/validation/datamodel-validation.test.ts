import { loadModel, loadModelWithError } from '../../utils';

describe('Data Model Validation Tests', () => {
    const prelude = `
        datasource db {
            provider = "postgresql"
            url = "url"
        }
    `;

    it('duplicated fields', async () => {
        expect(
            await loadModelWithError(`
                ${prelude}
                model M {
                    id String @id
                    x Int
                    x String
                }
        `)
        ).toContain('Duplicated declaration name "x"');
    });

    it('scalar types', async () => {
        await loadModel(`
            ${prelude}
            model M {
                id String @id
                a String
                b Boolean?
                c Int[]
                d BigInt
                e Float
                f Decimal
                g DateTime
                h Json
                i Bytes
            }
        `);
    });

    it('mix array and optional', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Int[]?
            }
        `)
        ).toContain(
            'Optional lists are not supported. Use either `Type[]` or `Type?`'
        );
    });

    it('unresolved field type', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Integer
            }
        `)
        ).toContain(
            `Could not resolve reference to TypeDeclaration named 'Integer'.`
        );

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Integer[]
            }
        `)
        ).toContain(
            `Could not resolve reference to TypeDeclaration named 'Integer'.`
        );

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                id String @id
                x Integer?
            }
        `)
        ).toContain(
            `Could not resolve reference to TypeDeclaration named 'Integer'.`
        );
    });

    it('id field', async () => {
        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                x Int
            }
        `)
        ).toContain(`Model must include a field with @id attribute`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                x Int @id
                y Int @id
            }
        `)
        ).toContain(`Model can include at most one field with @id attribute`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                x Int? @id
            }
        `)
        ).toContain(`Field with @id attribute must not be optional`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                x Int[] @id
            }
        `)
        ).toContain(`Field with @id attribute must be of scalar type`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model M {
                x Json @id
            }
        `)
        ).toContain(`Field with @id attribute must be of scalar type`);

        expect(
            await loadModelWithError(`
            ${prelude}
            model Id {
                id String @id
            }
            model M {
                myId Id @id
            }
        `)
        ).toContain(`Field with @id attribute must be of scalar type`);
    });

    it('builtin field attributes', async () => {
        await loadModel(`
            ${prelude}
            model M {
                x String @id @default("abc") @unique @map("_id") @updatedAt
            }
        `);
    });

    it('attribute type checking', async () => {});
});
