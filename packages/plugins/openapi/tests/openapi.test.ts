import { loadDocument } from 'zenstack/cli/cli-util';
import prismaPlugin from 'zenstack/plugins/prisma';
import { getDMMF } from '@prisma/internals';
import generate from '../src';
import * as tmp from 'tmp';
import * as fs from 'fs';

async function loadZModelAndDmmf(content: string) {
    const prelude = `
    datasource db {
        provider = 'sqlite'
        url = 'file:./test.db'
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

            model User {
                id String @id @default(cuid())
                email String @unique
            }
        `);

        generate(model, { schemaPath: modelFile, output: 'openapi.json' }, dmmf);
    });
});
