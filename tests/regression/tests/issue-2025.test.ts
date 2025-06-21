import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2025', () => {
    it('regression', async () => {
        const { enhanceRaw, prisma } = await loadSchema(
            `
    model User {
        id String @id @default(cuid())
        email String @unique @email
        termsAndConditions Int?
        @@allow('all', true)
    }
            `
        );

        const user = await prisma.user.create({
            data: {
                email: 'xyz', // invalid email
            },
        });

        const db = enhanceRaw(prisma, undefined, { validation: { inputOnlyValidationForUpdate: true } });
        await expect(
            db.user.update({
                where: { id: user.id },
                data: {
                    termsAndConditions: 1,
                },
            })
        ).toResolveTruthy();

        const db1 = enhanceRaw(prisma);
        await expect(
            db1.user.update({
                where: { id: user.id },
                data: {
                    termsAndConditions: 1,
                },
            })
        ).toBeRejectedByPolicy();
    });
});
