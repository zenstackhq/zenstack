import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1898', () => {
    it('regression', async () => {
        const { enhance, prisma } = await loadSchema(
            `
        model Role {
            id          Int          @id @default(autoincrement())
            name        String       @unique
            permissions Permission[]
            foos        Foo[]
            deletable   Boolean      @default(true)

            @@allow('all', true)
        }

        model Permission {
            id     Int    @id @default(autoincrement())
            name   String
            roleId Int
            role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)

            @@allow('all', true)
        }

        model Foo {
            id Int @id @default(autoincrement())
            name String
            roleId Int
            role Role @relation(fields: [roleId], references: [id])
        }
            `,
            { logPrismaQuery: true, prismaClientOptions: { log: ['query', 'info'] } }
        );

        const db = enhance();

        const role = await prisma.role.create({
            data: {
                name: 'regular',
                permissions: {
                    create: [
                        { id: 1, name: 'read' },
                        { id: 2, name: 'write' },
                    ],
                },
            },
        });

        const updatedRole = await prisma.role.update({
            where: { id: role.id },
            data: {
                name: 'admin',
                foos: {
                    create: { name: 'foo1' },
                },
                permissions: {
                    deleteMany: {
                        roleId: role.id,
                    },
                    create: { id: 3, name: 'delete' },
                    update: { where: { id: 3 }, data: { name: 'delete1' } },
                },
                deletable: false,
            },
            include: { permissions: true },
        });

        console.log(updatedRole);
    });
});
