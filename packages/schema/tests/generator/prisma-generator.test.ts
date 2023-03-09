/// <reference types="@types/jest" />

import { getDMMF } from '@prisma/internals';
import fs from 'fs';
import tmp from 'tmp';
import PrismaSchemaGenerator from '../../src/plugins/prisma/schema-generator';
import { loadModel } from '../utils';

describe('Prisma generator test', () => {
    it('triple slash comments', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'sqlite'
                url = 'file:dev.db'
            }

            /// This is a comment
            model Foo {
                id String @id 
                /// Comment for field value
                value Int
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            provider: '@zenstack/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
        expect(content).toContain('/// This is a comment');
        expect(content).toContain('/// Comment for field value');
    });

    it('triple slash attribute pass-through', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'sqlite'
                url = 'file:dev.db'
            }

            attribute @TypeGraphQL.omit(output: Any?, input: Any?)
            attribute @TypeGraphQL.field(name: String)

            model User {
                id Int @id
                password String @TypeGraphQL.omit(output: true, input: true)
                another String @TypeGraphQL.omit(input: ['update', 'where', 'orderBy'])
                foo String @TypeGraphQL.field(name: 'bar')
              }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            provider: '@zenstack/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
        expect(content).toContain(`/// @TypeGraphQL.omit(output: true, input: true)`);
        expect(content).toContain(`/// @TypeGraphQL.omit(input: ['update', 'where', 'orderBy'])`);
        expect(content).toContain(`/// @TypeGraphQL.field(name: 'bar')`);
    });

    it('model and field mapping', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
            }

            enum Role {
                ADMIN @map('admin')
                CUSTOMER @map('customer')
                @@map('_Role')
            }

            model User {
                id Int @id
                role Role @default(CUSTOMER) @map('_role')

                @@map('_User')
              }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            provider: '@zenstack/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
        expect(content).toContain(`@@map("_User")`);
        expect(content).toContain(`@map("_role")`);
        expect(content).toContain(`@@map("_Role")`);
        expect(content).toContain(`@map("admin")`);
        expect(content).toContain(`@map("customer")`);
    });

    it('attribute passthrough', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env('URL')
            }

            model Foo {
                id String @id 
                name String @prisma.passthrough('@unique()')
                x Int
                y Int
                @@prisma.passthrough('@@index([x, y])')
            }

            enum Role {
                USER @prisma.passthrough('@map("__user")')
                ADMIN @prisma.passthrough('@map("__admin")')

                @@prisma.passthrough('@@map("__role")')
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            provider: '@zenstack/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
        expect(content).toContain('@unique()');
        expect(content).toContain('@@index([x, y])');
    });

    it('multi schema', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env('URL')
                schemas = ['base', 'transactional']
            }

            generator client {
                provider        = "prisma-client-js"
                previewFeatures = ["multiSchema"]
            }

            model User {
                id     Int     @id
                orders Order[]
              
                @@schema("base")
            }
              
            model Order {
                id      Int  @id
                user    User @relation(fields: [id], references: [id])
                user_id Int
              
                @@schema("transactional")
            }
              
            enum Size {
                Small
                Medium
                Large
              
                @@schema("transactional")
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            provider: '@zenstack/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
            generateClient: false,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
        expect(content).toContain('@@schema("base")');
        expect(content).toContain('@@schema("base")');
        expect(content).toContain('schemas = ["base","transactional"]');
    });
});
