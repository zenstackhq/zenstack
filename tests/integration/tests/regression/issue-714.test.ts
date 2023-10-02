import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';

const DB_NAME = 'issue-714';

describe('Regression: issue 714', () => {
    let dbUrl: string;
    let prisma: any;

    beforeEach(async () => {
        dbUrl = await createPostgresDb(DB_NAME);
    });

    afterEach(async () => {
        if (prisma) {
            await prisma.$disconnect();
        }
        await dropPostgresDb(DB_NAME);
    });

    it('regression', async () => {
        const { prisma: _prisma, enhance } = await loadSchema(
            `        
        model User {
            id Int @id @default(autoincrement())
            username String @unique
        
            employedBy CompanyUser[]
            properties PropertyUser[]
            companies Company[]
        
            @@allow('all', true)
        }
        
        model Company {
            id Int @id @default(autoincrement())
            name String
        
            companyUsers CompanyUser[]
            propertyUsers User[]
            properties Property[]
        
            @@allow('all', true)
        }
        
        model CompanyUser {
            company Company @relation(fields: [companyId], references: [id])
            companyId Int
            user User @relation(fields: [userId], references: [id])
            userId Int
        
            dummyField String
        
            @@id([companyId, userId])
        
            @@allow('all', true)
        }
        
        enum PropertyUserRoleType {
            Owner
            Administrator
        }
        
        model PropertyUserRole {
            id Int @id @default(autoincrement())
            type PropertyUserRoleType
        
            user PropertyUser @relation(fields: [userId], references: [id])
            userId Int
        
            @@allow('all', true)
        }
        
        model PropertyUser {
            id Int @id @default(autoincrement())
            dummyField String
        
            property Property @relation(fields: [propertyId], references: [id])
            propertyId Int
            user User @relation(fields: [userId], references: [id])
            userId Int
        
            roles PropertyUserRole[]
        
            @@unique([propertyId, userId])
        
            @@allow('all', true)
        }
        
        model Property {
            id Int @id @default(autoincrement())
            name String
        
            users PropertyUser[]
            company Company @relation(fields: [companyId], references: [id])
            companyId Int
        
            @@allow('all', true)
        }            
        `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = _prisma;
        const db = enhance();

        await db.user.create({
            data: {
                username: 'test@example.com',
            },
        });

        await db.company.create({
            data: {
                name: 'My Company',
                companyUsers: {
                    create: {
                        dummyField: '',
                        user: {
                            connect: {
                                id: 1,
                            },
                        },
                    },
                },
                propertyUsers: {
                    connect: {
                        id: 1,
                    },
                },
                properties: {
                    create: [
                        {
                            name: 'Test',
                        },
                    ],
                },
            },
        });

        await db.property.update({
            data: {
                users: {
                    create: {
                        dummyField: '',
                        roles: {
                            createMany: {
                                data: {
                                    type: 'Owner',
                                },
                            },
                        },
                        user: {
                            connect: {
                                id: 1,
                            },
                        },
                    },
                },
            },
            where: {
                id: 1,
            },
        });
    });
});
