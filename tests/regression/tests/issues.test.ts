import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('GitHub issues regression', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('issue 389', async () => {
        const { enhance } = await loadSchema(`
        model model {
            id String @id @default(uuid())
            value Int
            @@allow('read', true)
            @@allow('create', value > 0)
        }
        `);
        const db = enhance();
        await expect(db.model.create({ data: { value: 0 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { value: 1 } })).toResolveTruthy();
    });

    it('issue 392', async () => {
        await loadSchema(
            `
            model M1 {
                m2_id String @id
                m2 M2 @relation(fields: [m2_id], references: [id])
            }
              
            model M2 {
                id String @id  
                m1 M1?
            }
              `
        );

        await loadSchema(
            `
            model M1 {
                id String @id
                m2_id String @unique
                m2 M2 @relation(fields: [m2_id], references: [id])
            }
              
            model M2 {
                id String @id  
                m1 M1?
            }
              `
        );

        await loadSchema(
            `
            model M1 {
                m2_id String
                m2 M2 @relation(fields: [m2_id], references: [id])
                @@id([m2_id])
            }
              
            model M2 {
                id String @id  
                m1 M1?
            }
              `
        );

        await loadSchema(
            `
            model M1 {
                m2_id String
                m2 M2 @relation(fields: [m2_id], references: [id])
                @@unique([m2_id])
            }
              
            model M2 {
                id String @id  
                m1 M1?
            }
              `
        );
    });

    it('select with _count', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id String @id @unique @default(uuid())
                posts Post[]
    
                @@allow('all', true)
            }
                
            model Post {
                id String @id @default(uuid())
                title String
                published Boolean @default(false)
                author User @relation(fields: [authorId], references: [id])
                authorId String
            
                @@allow('all', true)
            }  
              `
        );

        await prisma.user.create({
            data: {
                posts: {
                    create: [{ title: 'Post 1' }, { title: 'Post 2' }],
                },
            },
        });

        const db = enhance();
        const r = await db.user.findFirst({ select: { _count: { select: { posts: true } } } });
        expect(r).toMatchObject({ _count: { posts: 2 } });
    });

    it('issue 509', async () => {
        await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                email String @unique
                name String?
                posts Post[]
            }
              
            model Post {
                id Int @id @default(autoincrement())
                title String
                content String?
                published Boolean @default(false)
                author User? @relation(fields: [authorId], references: [id])
                authorId Int?
              
                deleted Boolean @default(false) @omit
              
                @@allow('all', true)
                @@deny('read', deleted)
            }
            `
        );
    });

    it('issue 552', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model Tenant {
                id Int @id @default(autoincrement())
                name String
            
                created_at DateTime @default(now())
                updated_at DateTime @updatedAt
            
                users UserTenant[]
            
                @@map("tenants")
            
            
                @@allow('all', auth().is_super_admin == true)
                @@allow('read', users?[user == auth() && status == 'ACTIVE' ])
                @@allow('all', users?[user == auth() && status == 'ACTIVE'])
            }
            
            model User {
                id Int @id @default(autoincrement())
                name String
                is_super_admin Boolean @default(false) @omit
            
                created_at DateTime @default(now())
                updated_at DateTime @updatedAt
            
                associated_tenants UserTenant[]
            
                @@map("users")
            
                @@allow('read', auth().id == id)
                @@allow('all', auth().is_super_admin == true )
                @@allow('read', associated_tenants?[tenant.users?[user == auth() && status == 'ACTIVE']])
                @@allow('all', associated_tenants?[tenant.users?[user == auth() && status == 'ACTIVE']] )
                @@allow('create', associated_tenants?[tenant.users?[user == auth() && status == 'ACTIVE']] )
                @@allow('update', associated_tenants?[tenant.users?[user == auth() && status == 'ACTIVE']] )
            }
            
            model UserTenant {
                user_id Int
                user User @relation(fields: [user_id], references: [id], onDelete: Cascade, onUpdate: Cascade)
            
                tenant_id Int
                tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade, onUpdate: Cascade)
            
                status String @default('INACTIVE')
            
                @@map("user_tenants")
            
                @@id([user_id, tenant_id])
            
                @@index([user_id])
                @@index([tenant_id])
                @@index([user_id, tenant_id])
            
                @@allow('all', auth().is_super_admin == true )
                @@allow('read', tenant.users?[user == auth() && status == 'ACTIVE' ])
                @@allow('all', tenant.users?[user == auth() && status == 'ACTIVE'])
                @@allow('update', tenant.users?[user == auth() && status == 'ACTIVE'])
                @@allow('delete', tenant.users?[user == auth() && status == 'ACTIVE'])
                @@allow('create', tenant.users?[user == auth() && status == 'ACTIVE'])
            }
            `
        );

        await prisma.user.deleteMany();
        await prisma.tenant.deleteMany();

        await prisma.tenant.create({
            data: {
                id: 1,
                name: 'tenant 1',
            },
        });

        await prisma.user.create({
            data: {
                id: 1,
                name: 'user 1',
            },
        });

        await prisma.userTenant.create({
            data: {
                user_id: 1,
                tenant_id: 1,
            },
        });

        const db = enhance({ id: 1, is_super_admin: true });
        await db.userTenant.update({
            where: {
                user_id_tenant_id: {
                    user_id: 1,
                    tenant_id: 1,
                },
            },
            data: {
                user: {
                    update: {
                        name: 'user 1 updated',
                    },
                },
            },
        });
    });

    it('issue 609', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model User {
                id String @id @default(cuid())
                comments Comment[]
            }
    
            model Comment {
                id                 String      @id @default(cuid())
                parentCommentId    String? 
                replies            Comment[]   @relation("CommentToComment")
                parent             Comment?    @relation("CommentToComment", fields: [parentCommentId], references: [id])
                comment            String
                author             User        @relation(fields: [authorId], references: [id])
                authorId           String      
                
                @@allow('read,create', true)
                @@allow('update,delete', auth() == author)
            }    
            `
        );

        await prisma.user.create({
            data: {
                id: '1',
                comments: {
                    create: {
                        id: '1',
                        comment: 'Comment 1',
                    },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: '2',
            },
        });

        // connecting a child comment from a different user to a parent comment should succeed
        const db = enhance({ id: '2' });
        await expect(
            db.comment.create({
                data: {
                    comment: 'Comment 2',
                    author: { connect: { id: '2' } },
                    parent: { connect: { id: '1' } },
                },
            })
        ).toResolveTruthy();
    });

    it('issue 624', async () => {
        const { prisma, enhance } = await loadSchema(
            `
model User {
    id String @id @default(uuid())
    email String @unique
    password String? @password @omit
    name String?
    orgs Organization[]
    posts Post[]
    groups Group[]
    comments Comment[]
    // can be created by anyone, even not logged in
    @@allow('create', true)
    // can be read by users in the same organization
    @@allow('read', orgs?[members?[auth().id == id]])
    // full access by oneself
    @@allow('all', auth().id == id)
}

model Organization {
    id String @id @default(uuid())
    name String
    members User[]
    post Post[]
    groups Group[]
    comments Comment[]

    // everyone can create a organization
    @@allow('create', true)
    // any user in the organization can read the organization
    @@allow('read', members?[auth().id == id])
}

abstract model organizationBaseEntity {
    id String @id @default(uuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    isDeleted Boolean @default(false) @omit
    isPublic Boolean @default(false)
    owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
    ownerId String
    org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
    orgId String
    groups Group[]

    // when create, owner must be set to current user, and user must be in the organization
    @@allow('create', owner == auth() && org.members?[id == auth().id])
    // only the owner can update it and is not allowed to change the owner
    @@allow('update', owner == auth() && org.members?[id == auth().id] && future().owner == owner)
    // allow owner to read
    @@allow('read', owner == auth())
    // allow shared group members to read it
    @@allow('read', groups?[users?[id == auth().id]])
    // allow organization to access if public
    @@allow('read', isPublic && org.members?[id == auth().id])
    // can not be read if deleted
    @@deny('all', isDeleted == true)
}

model Post extends organizationBaseEntity {
    title String
    content String
    comments Comment[]
}

model Comment extends organizationBaseEntity {
    content String
    post Post @relation(fields: [postId], references: [id])
    postId String
}

model Group {
    id String @id @default(uuid())
    name String
    users User[]
    posts Post[]
    comments Comment[]
    org Organization @relation(fields: [orgId], references: [id])
    orgId String

    // group is shared by organization
    @@allow('all', org.members?[auth().id == id])
}
        `
        );

        const userData = [
            {
                id: 'robin@prisma.io',
                name: 'Robin',
                email: 'robin@prisma.io',
                orgs: {
                    create: [
                        {
                            id: 'prisma',
                            name: 'prisma',
                        },
                    ],
                },
                groups: {
                    create: [
                        {
                            id: 'community',
                            name: 'community',
                            orgId: 'prisma',
                        },
                    ],
                },
                posts: {
                    create: [
                        {
                            id: 'slack',
                            title: 'Join the Prisma Slack',
                            content: 'https://slack.prisma.io',
                            orgId: 'prisma',
                            comments: {
                                create: [
                                    {
                                        id: 'comment-1',
                                        content: 'This is the first comment',
                                        orgId: 'prisma',
                                        ownerId: 'robin@prisma.io',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
            {
                id: 'bryan@prisma.io',
                name: 'Bryan',
                email: 'bryan@prisma.io',
                orgs: {
                    connect: {
                        id: 'prisma',
                    },
                },
                posts: {
                    create: [
                        {
                            id: 'discord',
                            title: 'Join the Prisma Discord',
                            content: 'https://discord.gg/jS3XY7vp46',
                            orgId: 'prisma',
                            groups: {
                                connect: {
                                    id: 'community',
                                },
                            },
                        },
                    ],
                },
            },
        ];

        for (const u of userData) {
            const user = await prisma.user.create({
                data: u,
            });
            console.log(`Created user with id: ${user.id}`);
        }

        const db = enhance({ id: 'robin@prisma.io' });
        await expect(
            db.post.findMany({
                where: {},
                select: {
                    id: true,
                    content: true,
                    owner: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                    comments: {
                        select: {
                            id: true,
                            content: true,
                            owner: {
                                select: {
                                    id: true,
                                    name: true,
                                },
                            },
                        },
                    },
                },
            })
        ).resolves.toHaveLength(2);
    });

    it('issue 627', async () => {
        const { prisma, enhance } = await loadSchema(
            `
model User {
    id String @id @default(uuid())
}

abstract model BaseEntityWithTenant {
    id String @id @default(uuid())

    name String
    tenant_id String
    tenant tenant? @relation(fields: [tenant_id], references: [id])

    @@allow('all', auth().id == tenant_id)
}

model tenant {
    id String @id @default(uuid())
    equipments Equipment[]
}

model Equipment extends BaseEntityWithTenant {
    a String
}
`
        );

        await prisma.tenant.create({
            data: {
                id: 'tenant-1',
            },
        });

        const db = enhance({ id: 'tenant-1' });
        await expect(
            db.equipment.create({
                data: {
                    name: 'equipment-1',
                    tenant: {
                        connect: {
                            id: 'tenant-1',
                        },
                    },
                    a: 'a',
                },
            })
        ).toResolveTruthy();
    });

    it('issue 632', async () => {
        const dbUrl = await createPostgresDb('issue-632');
        try {
            await loadSchema(
                `
enum InventoryUnit {
    DIGITAL
    FL_OZ
    GRAMS
    MILLILITERS
    OUNCES
    UNIT
    UNLIMITED
}
    
model TwoEnumsOneModelTest {
    id String @id @default(cuid())
    inventoryUnit   InventoryUnit @default(UNIT)
    inputUnit       InventoryUnit @default(UNIT)
}
`,
                { provider: 'postgresql', dbUrl }
            );
        } finally {
            await dropPostgresDb('issue-632');
        }
    });

    it('issue 634', async () => {
        const { prisma, enhance } = await loadSchema(
            `
model User {
    id String @id @default(uuid())
    email String @unique
    password String? @password @omit
    name String?
    orgs Organization[]
    posts Post[]
    groups Group[]
    comments Comment[]
    // can be created by anyone, even not logged in
    @@allow('create', true)
    // can be read by users in the same organization
    @@allow('read', orgs?[members?[auth().id == id]])
    // full access by oneself
    @@allow('all', auth() == this)
}

model Organization {
    id String @id @default(uuid())
    name String
    members User[]
    post Post[]
    groups Group[]
    comments Comment[]

    // everyone can create a organization
    @@allow('create', true)
    // any user in the organization can read the organization
    @@allow('read', members?[auth().id == id])
}

abstract model organizationBaseEntity {
    id String @id @default(uuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    isDeleted Boolean @default(false) @omit
    isPublic Boolean @default(false)
    owner User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
    ownerId String
    org Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
    orgId String
    groups Group[]

    // when create, owner must be set to current user, and user must be in the organization
    @@allow('create', owner == auth() && org.members?[id == auth().id])
    // only the owner can update it and is not allowed to change the owner
    @@allow('update', owner == auth() && org.members?[id == auth().id] && future().owner == owner)
    // allow owner to read
    @@allow('read', owner == auth())
    // allow shared group members to read it
    @@allow('read', groups?[users?[id == auth().id]])
    // allow organization to access if public
    @@allow('read', isPublic && org.members?[id == auth().id])
    // can not be read if deleted
    @@deny('all', isDeleted == true)
}

model Post extends organizationBaseEntity {
    title String
    content String
    comments Comment[]
}

model Comment extends organizationBaseEntity {
    content String
    post Post @relation(fields: [postId], references: [id])
    postId String
}

model Group {
    id String @id @default(uuid())
    name String
    users User[]
    posts Post[]
    comments Comment[]
    org Organization @relation(fields: [orgId], references: [id])
    orgId String

    // group is shared by organization
    @@allow('all', org.members?[auth().id == id])
}
`
        );

        const userData = [
            {
                id: 'robin@prisma.io',
                name: 'Robin',
                email: 'robin@prisma.io',
                orgs: {
                    create: [
                        {
                            id: 'prisma',
                            name: 'prisma',
                        },
                    ],
                },
                groups: {
                    create: [
                        {
                            id: 'community',
                            name: 'community',
                            orgId: 'prisma',
                        },
                    ],
                },
                posts: {
                    create: [
                        {
                            id: 'slack',
                            title: 'Join the Prisma Slack',
                            content: 'https://slack.prisma.io',
                            orgId: 'prisma',
                            comments: {
                                create: [
                                    {
                                        id: 'comment-1',
                                        content: 'This is the first comment',
                                        orgId: 'prisma',
                                        ownerId: 'robin@prisma.io',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
            {
                id: 'bryan@prisma.io',
                name: 'Bryan',
                email: 'bryan@prisma.io',
                orgs: {
                    connect: {
                        id: 'prisma',
                    },
                },
                posts: {
                    create: [
                        {
                            id: 'discord',
                            title: 'Join the Prisma Discord',
                            content: 'https://discord.gg/jS3XY7vp46',
                            orgId: 'prisma',
                            groups: {
                                connect: {
                                    id: 'community',
                                },
                            },
                        },
                    ],
                },
            },
        ];

        for (const u of userData) {
            const user = await prisma.user.create({
                data: u,
            });
            console.log(`Created user with id: ${user.id}`);
        }

        const db = enhance({ id: 'robin@prisma.io' });
        await expect(
            db.comment.findMany({
                where: {
                    owner: {
                        name: 'Bryan',
                    },
                },
                select: {
                    id: true,
                    content: true,
                    owner: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            })
        ).resolves.toHaveLength(0);

        await expect(
            db.comment.findMany({
                where: {
                    owner: {
                        name: 'Robin',
                    },
                },
                select: {
                    id: true,
                    content: true,
                    owner: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            })
        ).resolves.toHaveLength(1);
    });
});
