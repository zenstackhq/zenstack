/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
        const schemas = zodSchemas!.models;
        expect(schemas.UserSchema).toBeTruthy();
        expect(schemas.UserCreateSchema).toBeTruthy();
        expect(schemas.UserUpdateSchema).toBeTruthy();

        // create
        expect(schemas.UserCreateSchema.safeParse({ email: 'abc' }).success).toBeFalsy();
        expect(schemas.UserCreateSchema.safeParse({ role: 'Cook' }).success).toBeFalsy();
        expect(schemas.UserCreateSchema.safeParse({ email: 'abc@def.com' }).success).toBeFalsy();
        expect(schemas.UserCreateSchema.safeParse({ email: 'abc@zenstack.dev' }).success).toBeTruthy();
        expect(schemas.UserCreateSchema.safeParse({ email: 'abc@zenstack.dev', role: 'ADMIN' }).success).toBeTruthy();

        // update
        expect(schemas.UserUpdateSchema.safeParse({}).success).toBeTruthy();
        expect(schemas.UserUpdateSchema.safeParse({ email: 'abc@def.com' }).success).toBeFalsy();
        expect(schemas.UserUpdateSchema.safeParse({ email: 'def@zenstack.dev' }).success).toBeTruthy();

        // full schema
        expect(schemas.UserSchema.safeParse({ email: 'abc@zenstack.dev', role: 'ADMIN' }).success).toBeFalsy();
        expect(
            schemas.UserSchema.safeParse({
                id: 1,
                email: 'abc@zenstack.dev',
                role: 'ADMIN',
                createdAt: new Date(),
                updatedAt: new Date(),
            }).success
        ).toBeTruthy();

        expect(schemas.PostSchema).toBeTruthy();
        expect(schemas.PostCreateSchema).toBeTruthy();
        expect(schemas.PostUpdateSchema).toBeTruthy();
        expect(schemas.PostCreateSchema.safeParse({ title: 'abc' }).success).toBeFalsy();
        expect(schemas.PostCreateSchema.safeParse({ title: 'abcabcabcabc' }).success).toBeFalsy();
        expect(schemas.PostCreateSchema.safeParse({ title: 'abcde' }).success).toBeTruthy();
    });
});
