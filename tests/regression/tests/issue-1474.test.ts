import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1474', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model A {
                id Int @id
                cs C[]
            }

            abstract model B {
                a A @relation(fields: [aId], references: [id])
                aId Int
            }

            model C extends B {
                id Int @id
                type String
                @@delegate(type)
            }

            model D extends C {
            }
            `
        );
    });
});
