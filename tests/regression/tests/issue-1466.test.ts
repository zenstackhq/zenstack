import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('issue 1466', () => {
    it('regression1', async () => {
        const dbUrl = await createPostgresDb('issue-1466-1');
        let prisma: any;

        try {
            const r = await loadSchema(
                `
                model UserLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    level Int @default(0)
                    asset AssetLongLongLongLongName @relation(fields: [assetId], references: [id])
                    assetId Int @unique
                }
                
                model AssetLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    createdAt DateTime @default(now())
                    viewCount Int @default(0)
                    owner UserLongLongLongLongName?
                    assetType String
                    
                    @@delegate(assetType)
                }
                
                model VideoLongLongLongLongName extends AssetLongLongLongLongName {
                    duration Int
                }        
                `,
                {
                    provider: 'postgresql',
                    dbUrl,
                    enhancements: ['delegate'],
                }
            );

            prisma = r.prisma;
            const db = r.enhance();

            const video = await db.VideoLongLongLongLongName.create({
                data: { duration: 100 },
            });

            const user = await db.UserLongLongLongLongName.create({
                data: {
                    asset: { connect: { id: video.id } },
                },
            });

            const userWithAsset = await db.UserLongLongLongLongName.findFirst({
                include: { asset: true },
            });

            expect(userWithAsset).toMatchObject({
                asset: { assetType: 'VideoLongLongLongLongName', duration: 100 },
            });
        } finally {
            if (prisma) {
                await prisma.$disconnect();
            }
            await dropPostgresDb('issue-1466-1');
        }
    });

    it('regression2', async () => {
        const dbUrl = await createPostgresDb('issue-1466-2');
        let prisma: any;

        try {
            const r = await loadSchema(
                `
                model UserLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    level Int @default(0)
                    asset AssetLongLongLongLongName @relation(fields: [assetId], references: [id])
                    assetId Int

                    @@unique([assetId])
                }
                
                model AssetLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    createdAt DateTime @default(now())
                    viewCount Int @default(0)
                    owner UserLongLongLongLongName?
                    assetType String
                    
                    @@delegate(assetType)
                }
                
                model VideoLongLongLongLongName extends AssetLongLongLongLongName {
                    duration Int
                }        
                `,
                {
                    provider: 'postgresql',
                    dbUrl,
                    enhancements: ['delegate'],
                }
            );

            prisma = r.prisma;
            const db = r.enhance();

            const video = await db.VideoLongLongLongLongName.create({
                data: { duration: 100 },
            });

            const user = await db.UserLongLongLongLongName.create({
                data: {
                    asset: { connect: { id: video.id } },
                },
            });

            const userWithAsset = await db.UserLongLongLongLongName.findFirst({
                include: { asset: true },
            });

            expect(userWithAsset).toMatchObject({
                asset: { assetType: 'VideoLongLongLongLongName', duration: 100 },
            });
        } finally {
            if (prisma) {
                await prisma.$disconnect();
            }
            await dropPostgresDb('issue-1466-2');
        }
    });

    it('regression3', async () => {
        await loadSchema(
            `
                model UserLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    level Int @default(0)
                    asset AssetLongLongLongLongName @relation(fields: [assetId], references: [id])
                    assetId Int @unique
                }
                
                model AssetLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    createdAt DateTime @default(now())
                    viewCount Int @default(0)
                    owner UserLongLongLongLongName?
                    assetType String
                    
                    @@delegate(assetType)
                }
                
                model VideoLongLongLongLongName1 extends AssetLongLongLongLongName {
                    duration Int
                }        

                model VideoLongLongLongLongName2 extends AssetLongLongLongLongName {
                    format String
                }        
                `,
            {
                provider: 'postgresql',
                pushDb: false,
            }
        );
    });

    it('regression4', async () => {
        await loadSchema(
            `
                model UserLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    level Int @default(0)
                    asset AssetLongLongLongLongName @relation(fields: [assetId], references: [id])
                    assetId Int @unique
                }
                
                model AssetLongLongLongLongName {
                    id Int @id @default(autoincrement())
                    createdAt DateTime @default(now())
                    viewCount Int @default(0)
                    owner UserLongLongLongLongName?
                    assetType String
                    
                    @@delegate(assetType)
                }
                
                model VideoLongLongLongLongName1 extends AssetLongLongLongLongName {
                    duration Int
                }        

                model VideoLongLongLongLongName2 extends AssetLongLongLongLongName {
                    format String
                }        
                `,
            {
                provider: 'postgresql',
                pushDb: false,
            }
        );
    });

    it('regression5', async () => {
        await loadSchema(
            `
            model UserLongLongLongLongName {
                id Int @id @default(autoincrement())
                level Int @default(0)
                asset AssetLongLongLongLongName @relation(fields: [assetId], references: [id])
                assetId Int @unique(map: 'assetId_unique')
            }
            
            model AssetLongLongLongLongName {
                id Int @id @default(autoincrement())
                createdAt DateTime @default(now())
                viewCount Int @default(0)
                owner UserLongLongLongLongName?
                assetType String
                
                @@delegate(assetType)
            }
            
            model VideoLongLongLongLongName1 extends AssetLongLongLongLongName {
                duration Int
            }        

            model VideoLongLongLongLongName2 extends AssetLongLongLongLongName {
                format String
            }        
            `,
            {
                provider: 'postgresql',
                pushDb: false,
            }
        );
    });
});
