import { loadSchema } from '@zenstackhq/testtools';
import fs from 'fs';

describe('issue 1647', () => {
    it('inherits @@schema by default', async () => {
        const { projectDir } = await loadSchema(
            `
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
                schemas = ['public', 'post']
            }

            generator client {
                provider = 'prisma-client-js'
                previewFeatures = ['multiSchema']
            }

            model Asset {
                id Int @id
                type String
                @@delegate(type)
                @@schema('public')
            }
            
            model Post extends Asset {
                title String
            }
            `,
            { addPrelude: false, pushDb: false, getPrismaOnly: true }
        );

        const prismaSchema = fs.readFileSync(`${projectDir}/prisma/schema.prisma`, 'utf-8');
        expect(prismaSchema.split('\n').filter((l) => l.includes('@@schema("public")'))).toHaveLength(2);
    });
    it('respects sub model @@schema overrides', async () => {
        const { projectDir } = await loadSchema(
            `
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
                schemas = ['public', 'post']
            }

            generator client {
                provider = 'prisma-client-js'
                previewFeatures = ['multiSchema']
            }

            model Asset {
                id Int @id
                type String
                @@delegate(type)
                @@schema('public')
            }
            
            model Post extends Asset {
                title String
                @@schema('post')
            }
            `,
            { addPrelude: false, pushDb: false, getPrismaOnly: true }
        );

        const prismaSchema = fs.readFileSync(`${projectDir}/prisma/schema.prisma`, 'utf-8');
        expect(prismaSchema.split('\n').filter((l) => l.includes('@@schema("public")'))).toHaveLength(1);
        expect(prismaSchema.split('\n').filter((l) => l.includes('@@schema("post")'))).toHaveLength(1);
    });
});
