/// <reference types="@types/jest" />

import { getDMMF } from '@prisma/internals';
import OpenAPIParser from '@readme/openapi-parser';
import * as fs from 'fs';
import * as tmp from 'tmp';
import { loadDocument } from 'zenstack/cli/cli-util';
import prismaPlugin from 'zenstack/plugins/prisma';
import generate from '../src';

async function loadZModelAndDmmf(content: string) {
    const prelude = `
    datasource db {
        provider = 'postgresql'
        url = env('DATABASE_URL')
    }
`;

    const { name: modelFile } = tmp.fileSync({ postfix: '.zmodel' });
    fs.writeFileSync(modelFile, `${prelude}\n${content}`);

    const model = await loadDocument(modelFile);

    const { name: prismaFile } = tmp.fileSync({ postfix: '.prisma' });
    await prismaPlugin(model, { schemaPath: modelFile, output: prismaFile, generateClient: false });

    const prismaContent = fs.readFileSync(prismaFile, { encoding: 'utf-8' });

    const dmmf = await getDMMF({ datamodel: prismaContent });
    return { model, dmmf, modelFile };
}

describe('Open API Plugin Tests', () => {
    it('run plugin', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
            plugin openapi {
                provider = '${process.cwd()}/dist'
            }

            enum Role {
                USER
                ADMIN
            }

            model User {
                id String @id
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
                email String @unique
                role Role @default(USER)
                posts Post[]
            
                @@openapi.meta({
                    findMany: {
                        description: 'Find users matching the given conditions'
                    },
                    delete: {
                        method: 'put',
                        path: 'dodelete',
                        description: 'Delete a unique user',
                        summary: 'Delete a user yeah yeah',
                        tags: ['delete', 'user']
                    },
                })
            }
            
            model Post {
                id String @id
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
                title String
                author User? @relation(fields: [authorId], references: [id])
                authorId String?
                published Boolean @default(false)
                viewCount Int @default(0)
            
                @@openapi.meta({
                    findMany: {
                        ignore: true
                    }
                })
            }

            model Foo {
                id String @id

                @@openapi.ignore
            }
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        generate(model, { schemaPath: modelFile, output }, dmmf);

        console.log('OpenAPI specification generated:', output);

        const api = await OpenAPIParser.validate(output);
        expect(api.paths?.['/user/findMany']?.['get']?.description).toBe('Find users matching the given conditions');
        const del = api.paths?.['/user/dodelete']?.['put'];
        expect(del?.description).toBe('Delete a unique user');
        expect(del?.summary).toBe('Delete a user yeah yeah');
        expect(del?.tags).toEqual(expect.arrayContaining(['delete', 'user']));
        expect(api.paths?.['/post/findMany']).toBeUndefined();

        expect(api.paths?.['/foo/findMany']).toBeUndefined();
    });
});
