/// <reference types="@types/jest" />

import { getDMMF } from '@zenstackhq/sdk';
import fs from 'fs';
import path from 'path';
import tmp from 'tmp';
import { loadDocument } from '../../src/cli/cli-util';
import PrismaSchemaGenerator from '../../src/plugins/prisma/schema-generator';
import { loadModel } from '@zenstackhq/testtools';

describe('Prisma generator test', () => {
    it('datasource coverage', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env("DATABASE_URL")
                directUrl = env("DATABASE_URL")
                shadowDatabaseUrl = env("DATABASE_URL")
                extensions = [pg_trgm, postgis(version: "3.3.2"), uuid_ossp(map: "uuid-ossp", schema: "extensions")]
                schemas    = ["auth", "public"]
            }

            generator client {
                provider        = "prisma-client-js"
                previewFeatures = ["multiSchema", "postgresqlExtensions"]
            }

            model User {
                id String @id

                @@schema("auth")
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
        });

        const content = fs.readFileSync(name, 'utf-8');
        expect(content).toContain('provider = "postgresql"');
        expect(content).toContain('url = env("DATABASE_URL")');
        expect(content).toContain('directUrl = env("DATABASE_URL")');
        expect(content).toContain('shadowDatabaseUrl = env("DATABASE_URL")');
        expect(content).toContain(
            'extensions = [pg_trgm, postgis(version: "3.3.2"), uuid_ossp(map: "uuid-ossp", schema: "extensions")]'
        );
        expect(content).toContain('schemas = ["auth", "public"]');
        await getDMMF({ datamodel: content });
    });

    it('field type coverage', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env('DATABASE_URL')
            }

            model User {
                id String @id
                age Int
                serial BigInt
                height Float
                salary Decimal
                activated Boolean
                createdAt DateTime
                metadata Json
                content Bytes
                unsupported Unsupported('foo')
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });

        expect(content).toContain('id String');
        expect(content).toContain('age Int');
        expect(content).toContain('serial BigInt');
        expect(content).toContain('height Float');
        expect(content).toContain('salary Decimal');
        expect(content).toContain('activated Boolean');
        expect(content).toContain('createdAt DateTime');
        expect(content).toContain('metadata Json');
        expect(content).toContain('content Bytes');
        expect(content).toContain('unsupported Unsupported("foo")');
    });

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
            name: 'Prisma',
            provider: '@core/prisma',
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
            name: 'Prisma',
            provider: '@core/prisma',
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
            name: 'Prisma',
            provider: '@core/prisma',
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
            name: 'Prisma',
            provider: '@core/prisma',
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
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
            generateClient: false,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
        expect(content).toContain('@@schema("base")');
        expect(content).toContain('@@schema("base")');
        expect(content).toContain('schemas = ["base", "transactional"]');
    });

    it('abstract model', async () => {
        const model = await loadModel(`
        datasource db {
            provider = 'postgresql'
            url = env('URL')
        }
        abstract model Base {
            id String @id
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
        }

        abstract model Content {
            title String
        }

        model Post extends Base, Content {
            published Boolean @default(false)
        }
    `);
        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
            generateClient: false,
        });

        const content = fs.readFileSync(name, 'utf-8');
        const dmmf = await getDMMF({ datamodel: content });

        expect(dmmf.datamodel.models.length).toBe(1);
        const post = dmmf.datamodel.models[0];
        expect(post.name).toBe('Post');
        expect(post.fields.length).toBe(5);
        expect(post.fields[0].name).toBe('id');
        expect(post.fields[3].name).toBe('title');
        expect(post.fields[4].name).toBe('published');
    });

    it('abstract multi files', async () => {
        const model = await loadDocument(path.join(__dirname, './zmodel/schema.zmodel'));

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
            generateClient: false,
        });

        const content = fs.readFileSync(name, 'utf-8');
        const dmmf = await getDMMF({ datamodel: content });

        expect(dmmf.datamodel.models.length).toBe(3);
        expect(dmmf.datamodel.enums[0].name).toBe('UserRole');

        const post = dmmf.datamodel.models.find((m) => m.name === 'Post');

        expect(post?.documentation?.replace(/\s/g, '')).toBe(
            `@@allow('read', owner == auth()) @@allow('delete', owner == auth())`.replace(/\s/g, '')
        );

        const todo = dmmf.datamodel.models.find((m) => m.name === 'Todo');
        expect(todo?.documentation?.replace(/\s/g, '')).toBe(`@@allow('read', owner == auth())`.replace(/\s/g, ''));
    });

    it('format prisma', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env('URL')
            }

            model Post {
                id Int @id() @default(autoincrement())
                title String
                content String?
                published Boolean @default(false)
                @@allow('read', published)
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
            format: true,
        });

        const content = fs.readFileSync(name, 'utf-8');
        const expected = fs.readFileSync(path.join(__dirname, './prisma/format.prisma'), 'utf-8');

        expect(content).toBe(expected);
    });

    it('view support', async () => {
        const model = await loadModel(`
            datasource db {
                provider = 'postgresql'
                url = env('URL')
            }

            generator client {
                provider = "prisma-client-js"
                previewFeatures = ["views"]
            }

            view UserInfo {
                id    Int    @unique
                email String
                name  String
                bio   String
            }
        `);

        const { name } = tmp.fileSync({ postfix: '.prisma' });
        await new PrismaSchemaGenerator().generate(model, {
            name: 'Prisma',
            provider: '@core/prisma',
            schemaPath: 'schema.zmodel',
            output: name,
            format: false,
            generateClient: false,
        });

        const content = fs.readFileSync(name, 'utf-8');
        await getDMMF({ datamodel: content });
    });
});
