import { isPrismaClientValidationError } from '@zenstackhq/runtime';
import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1596', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                posts Post[]
            }
            
            model Post {
                id Int @id
                title String
                author User @relation(fields: [authorId], references: [id])
                authorId Int @default(auth().id)
            }
            `
        );

        const db = enhance();

        try {
            await db.post.create({ data: { title: 'Post1' } });
        } catch (e) {
            // eslint-disable-next-line jest/no-conditional-expect
            expect(isPrismaClientValidationError(e)).toBe(true);
            return;
        }

        throw new Error('Expected error');
    });
});
