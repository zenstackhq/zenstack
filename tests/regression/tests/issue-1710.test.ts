import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1710', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Profile {
                id          String   @id @default(cuid())
                createdAt   DateTime @default(now())
                updatedAt   DateTime @updatedAt
                displayName String
                type        String

                @@delegate(type)
                @@allow('read,create', true)
            }

            model User extends Profile {
                email    String    @unique @deny('read', true)
                password String    @omit
                role     String    @default('USER') @deny('read,update', true)
            }

            model Organization extends Profile {}
            `
        );

        const db = enhance();
        const user = await db.user.create({
            data: { displayName: 'User1', email: 'a@b.com', password: '123' },
        });
        expect(user.email).toBeUndefined();
        expect(user.password).toBeUndefined();

        const foundUser = await db.profile.findUnique({ where: { id: user.id } });
        expect(foundUser.email).toBeUndefined();
        expect(foundUser.password).toBeUndefined();

        await expect(
            db.profile.update({
                where: {
                    id: user.id,
                },
                data: {
                    delegate_aux_user: {
                        update: {
                            role: 'ADMIN',
                        },
                    },
                },
            })
        ).rejects.toThrow('Auxiliary relation field');
    });
});
