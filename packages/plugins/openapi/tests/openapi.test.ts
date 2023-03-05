import { loadDocument } from 'zenstack/cli/cli-util';
import prismaPlugin from 'zenstack/plugins/prisma';
import { getDMMF } from '@prisma/internals';
import generate from '../src';
import * as tmp from 'tmp';
import * as fs from 'fs';

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
    await prismaPlugin(model, { schemaPath: modelFile, output: prismaFile, prismaGenerate: false });

    const prismaContent = fs.readFileSync(prismaFile, { encoding: 'utf-8' });

    const dmmf = await getDMMF({ datamodel: prismaContent });
    return { model, dmmf, modelFile };
}

describe('Open API Plugin Tests', () => {
    it('run plugin', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
            plugin openapi {
                provider = '@zenstackhq/openapi'
            }

            enum Role {
                USER
                ADMIN
            }

            model User {
                id String @id
                email String @unique
                role Role @default(USER)
                posts Post[]
            
                @@allow('create,read', true)
                @@allow('update,delete', auth() == this)
            }
            
            model Post {
                id String @id
                title String
                author User? @relation(fields: [authorId], references: [id])
                authorId String?
                published Boolean @default(false)
            
                @@allow('all', auth() == this)
                @@allow('read', published)
            }
        `);

        generate(model, { schemaPath: modelFile, output: 'openapi.json' }, dmmf);
    });
});
