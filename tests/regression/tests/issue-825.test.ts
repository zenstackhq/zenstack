import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 825', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id    Int     @id @default(autoincrement())
                role String
              
                @@allow('read', true)
                @@allow('update', auth().id == id || auth().role == 'superadmin' || auth().role == 'admin')
                @@deny('update', 
                    (role == 'superadmin' && auth().id != id) 
                    || (role == 'admin' && auth().id != id && auth().role != 'superadmin') 
                    || (role != future().role && auth().role != 'admin' && auth().role != 'superadmin') 
                    || (role != future().role && future().role == 'superadmin') 
                    || (role != future().role && future().role == 'admin' && auth().role != 'superadmin')
                )
            }
            `
        );

        const admin = await prisma.user.create({
            data: { role: 'admin' },
        });

        const user = await prisma.user.create({
            data: { role: 'customer' },
        });

        const r = await enhance(admin).user.update({
            where: { id: user.id },
            data: { role: 'staff' },
        });

        expect(r.role).toEqual('staff');
    });
});
