import { loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1243', () => {
    it('uninheritable fields', async () => {
        const schema = `
        model Base {
            id String @id @default(cuid())
            type String
            foo String
            
            @@delegate(type)
            @@index([foo])
            @@map('base')
            @@unique([foo])
        }

        model Item1 extends Base {
            x String
        }

        model Item2 extends Base {
            y String
        }
        `;

        await loadSchema(schema, {
            enhancements: ['delegate'],
        });
    });

    it('multiple id fields', async () => {
        const schema = `
        model Base {
            id1 String
            id2 String
            type String
            
            @@delegate(type)
            @@id([id1, id2])
        }

        model Item1 extends Base {
            x String
        }

        model Item2 extends Base {
            y String
        }
        `;

        await loadSchema(schema, {
            enhancements: ['delegate'],
        });
    });
});
