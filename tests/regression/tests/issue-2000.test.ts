import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2000', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            abstract model Base {
                id              String          @id  @default(uuid())    @deny('update', true)
                createdAt       DateTime        @default(now())          @deny('update', true)
                updatedAt       DateTime        @updatedAt               @deny('update', true)
                active          Boolean         @default(false)
                published       Boolean         @default(true)           
                deleted         Boolean         @default(false)
                startDate       DateTime?
                endDate         DateTime?

                @@allow('create', true)
                @@allow('read', true)
                @@allow('update', true)
            }

            enum EntityType {
                User
                Alias
                Group
                Service
                Device
                Organization
                Guest
            }

            model Entity extends Base {
                entityType      EntityType
                name            String?                 @unique
                members         Entity[]                @relation("members")
                memberOf        Entity[]                @relation("members")
                @@delegate(entityType)


                @@allow('create', true)
                @@allow('read', true)
                @@allow('update', true)
                @@validate(!active || (active && name != null), "Active Entities Must Have A Name")
            }

            model User extends Entity {
                profile         Json?               
                username        String                  @unique 
                password        String                  @password

                @@allow('create', true)
                @@allow('read', true)
                @@allow('update', true)
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { username: 'admin', password: 'abc12345' } })).toResolveTruthy();
        await expect(
            db.user.update({ where: { username: 'admin' }, data: { password: 'abc123456789123' } })
        ).toResolveTruthy();

        // violating validation rules
        await expect(db.user.update({ where: { username: 'admin' }, data: { active: true } })).toBeRejectedByPolicy();
    });
});
