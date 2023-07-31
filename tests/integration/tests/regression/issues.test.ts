import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('GitHub issues regression', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('issue 386', async () => {
        const { withPolicy } = await loadSchema(
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
        
            @@allow('all', contains(title, 'Post'))
        }      
        `
        );

        const db = withPolicy();
        const created = await db.user.create({
            data: {
                posts: {
                    create: {
                        title: 'Post 1',
                    },
                },
            },
            include: {
                posts: true,
            },
        });
        expect(created.posts[0].zenstack_guard).toBeUndefined();
        expect(created.posts[0].zenstack_transaction).toBeUndefined();

        const queried = await db.user.findFirst({ include: { posts: true } });
        expect(queried.posts[0].zenstack_guard).toBeUndefined();
        expect(queried.posts[0].zenstack_transaction).toBeUndefined();
    });

    it('issue 389', async () => {
        const { withPolicy } = await loadSchema(`
        model model {
            id String @id @default(uuid())
            value Int
            @@allow('read', true)
            @@allow('create', value > 0)
        }
        `);
        const db = withPolicy();
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
        const { prisma, withPolicy } = await loadSchema(
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

        const db = withPolicy();
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
        const { withPolicy, prisma } = await loadSchema(
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

        const db = withPolicy({ id: 1, is_super_admin: true });
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
        const { withPolicy, prisma } = await loadSchema(
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
        const db = withPolicy({ id: '2' });
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
});
