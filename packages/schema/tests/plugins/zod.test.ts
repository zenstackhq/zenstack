/// <reference types="@types/jest" />

import { loadSchema } from '@zenstackhq/testtools';

describe('Zod plugin tests', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('basic generation', async () => {
        const model = `
        datasource db {
            provider = 'postgresql'
            url = env('DATABASE_URL')
        }
        
        generator js {
            provider = 'prisma-client-js'
        }

        enum Role {
            USER
            ADMIN 
        }

        model User {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
            email String @unique @email @endsWith('@zenstack.dev')
            role Role @default(USER)
            posts Post[]
        }
        
        model Post {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
            title String @length(5, 10)
            author User? @relation(fields: [authorId], references: [id])
            authorId Int?
            published Boolean @default(false)
            viewCount Int @default(0)
        }
        `;

        const { zodSchemas } = await loadSchema(model, false, false);
        expect(zodSchemas.UserSchema).toBeTruthy();
        expect(zodSchemas.UserCreateSchema).toBeTruthy();
        expect(zodSchemas.UserUpdateSchema).toBeTruthy();

        // create
        expect(zodSchemas.UserCreateSchema.safeParse({ email: 'abc' }).success).toBeFalsy();
        expect(zodSchemas.UserCreateSchema.safeParse({ role: 'Cook' }).success).toBeFalsy();
        expect(zodSchemas.UserCreateSchema.safeParse({ email: 'abc@def.com' }).success).toBeFalsy();
        expect(zodSchemas.UserCreateSchema.safeParse({ email: 'abc@zenstack.dev' }).success).toBeTruthy();
        expect(
            zodSchemas.UserCreateSchema.safeParse({ email: 'abc@zenstack.dev', role: 'ADMIN' }).success
        ).toBeTruthy();

        // update
        expect(zodSchemas.UserUpdateSchema.safeParse({}).success).toBeTruthy();
        expect(zodSchemas.UserUpdateSchema.safeParse({ email: 'abc@def.com' }).success).toBeFalsy();
        expect(zodSchemas.UserUpdateSchema.safeParse({ email: 'def@zenstack.dev' }).success).toBeTruthy();

        // full schema
        expect(zodSchemas.UserSchema.safeParse({ email: 'abc@zenstack.dev', role: 'ADMIN' }).success).toBeFalsy();
        expect(
            zodSchemas.UserSchema.safeParse({
                id: 1,
                email: 'abc@zenstack.dev',
                role: 'ADMIN',
                createdAt: new Date(),
                updatedAt: new Date(),
            }).success
        ).toBeTruthy();

        expect(zodSchemas.PostSchema).toBeTruthy();
        expect(zodSchemas.PostCreateSchema).toBeTruthy();
        expect(zodSchemas.PostUpdateSchema).toBeTruthy();
        expect(zodSchemas.PostCreateSchema.safeParse({ title: 'abc' }).success).toBeFalsy();
        expect(zodSchemas.PostCreateSchema.safeParse({ title: 'abcabcabcabc' }).success).toBeFalsy();
        expect(zodSchemas.PostCreateSchema.safeParse({ title: 'abcde' }).success).toBeTruthy();
    });
});
