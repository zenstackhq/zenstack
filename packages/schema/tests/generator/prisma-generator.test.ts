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
        expect(content).toContain(`@@map("_User")`);
        expect(content).toContain(`@map("_role")`);
        expect(content).toContain(`@@map("_Role")`);
        expect(content).toContain(`@map("admin")`);
        expect(content).toContain(`@map("customer")`);
    });
});
