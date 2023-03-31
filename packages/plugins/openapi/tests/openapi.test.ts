/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import OpenAPIParser from '@readme/openapi-parser';
import { loadZModelAndDmmf } from '@zenstackhq/testtools';
import * as tmp from 'tmp';
import * as fs from 'fs';
import generate from '../src';
import YAML from 'yaml';
import { isPlugin, Model, Plugin } from '@zenstackhq/sdk/ast';
import { getLiteral } from '@zenstackhq/sdk';

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

model Bar {
    id String @id
    @@ignore
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });

        const options = buildOptions(model, modelFile, output);
        generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.openapi).toBe('3.1.0');

        const api = await OpenAPIParser.validate(output);
        expect(api.paths?.['/user/findMany']?.['get']?.description).toBe('Find users matching the given conditions');
        const del = api.paths?.['/user/dodelete']?.['put'];
        expect(del?.description).toBe('Delete a unique user');
        expect(del?.summary).toBe('Delete a user yeah yeah');
        expect(del?.tags).toEqual(expect.arrayContaining(['delete', 'user']));
        expect(api.paths?.['/post/findMany']).toBeUndefined();

        expect(api.paths?.['/foo/findMany']).toBeUndefined();
        expect(api.paths?.['/bar/findMany']).toBeUndefined();
    });

    it('options', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${process.cwd()}/dist'
    specVersion = '3.0.0'
    title = 'My Awesome API'
    version = '1.0.0'
    description = 'awesome api'
    prefix = '/myapi'
}

model User {
    id String @id
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.openapi).toBe('3.0.0');

        const api = await OpenAPIParser.validate(output);
        expect(api.info).toEqual(
            expect.objectContaining({
                title: 'My Awesome API',
                version: '1.0.0',
                description: 'awesome api',
            })
        );

        expect(api.paths?.['/myapi/user/findMany']).toBeTruthy();
    });

    it('v3.1.0 fields', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${process.cwd()}/dist'
    summary = 'awesome api'
}

model User {
    id String @id
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.openapi).toBe('3.1.0');

        const api = await OpenAPIParser.validate(output);
        expect((api.info as any).summary).toEqual('awesome api');
    });
});

function buildOptions(model: Model, modelFile: string, output: string) {
    const optionFields = model.declarations.find((d): d is Plugin => isPlugin(d))?.fields || [];
    const options: any = { schemaPath: modelFile, output };
    optionFields.forEach((f) => (options[f.name] = getLiteral(f.value)));
    return options;
}
