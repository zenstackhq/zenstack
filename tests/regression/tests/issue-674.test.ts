import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 674', () => {
    it('regression', async () => {
        await loadSchema(
            `
model Foo {
    id Int @id
}

enum MyUnUsedEnum { ABC CDE @@map('my_unused_enum') }
        `,
            { provider: 'postgresql', dbUrl: 'env("DATABASE_URL")', pushDb: false }
        );
    });
});
