/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import OpenAPIParser from '@readme/openapi-parser';
import { getLiteral, getObjectLiteral } from '@zenstackhq/sdk';
import { isPlugin, Model, Plugin } from '@zenstackhq/sdk/ast';
import { loadZModelAndDmmf } from '@zenstackhq/testtools';
import * as fs from 'fs';
import * as tmp from 'tmp';
import YAML from 'yaml';
import generate from '../src';

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
        tagDescription: 'Post-related operations'
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

        const options = buildOptions(model, modelFile, output, '3.1.0');
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const api = await OpenAPIParser.validate(output);

        expect(api.tags).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: 'user', description: 'User operations' }),
                expect.objectContaining({ name: 'post', description: 'Post-related operations' }),
            ])
        );

        expect(api.paths?.['/user']?.['get']).toBeTruthy();
        expect(api.paths?.['/user']?.['post']).toBeTruthy();
        expect(api.paths?.['/user']?.['put']).toBeFalsy();
        expect(api.paths?.['/user/{id}']?.['get']).toBeTruthy();
        expect(api.paths?.['/user/{id}']?.['patch']).toBeTruthy();
        expect(api.paths?.['/user/{id}']?.['delete']).toBeTruthy();
        expect(api.paths?.['/user/{id}/posts']?.['get']).toBeTruthy();
        expect(api.paths?.['/user/{id}/relationships/posts']?.['get']).toBeTruthy();
        expect(api.paths?.['/user/{id}/relationships/posts']?.['post']).toBeTruthy();
        expect(api.paths?.['/user/{id}/relationships/posts']?.['patch']).toBeTruthy();
        expect(api.paths?.['/post/{id}/relationships/author']?.['get']).toBeTruthy();
        expect(api.paths?.['/post/{id}/relationships/author']?.['post']).toBeUndefined();
        expect(api.paths?.['/post/{id}/relationships/author']?.['patch']).toBeTruthy();
        expect(api.paths?.['/foo']).toBeUndefined();
        expect(api.paths?.['/bar']).toBeUndefined();

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.openapi).toBe('3.1.0');
        const baseline = YAML.parse(fs.readFileSync(`${__dirname}/baseline/rest.baseline.yaml`, 'utf-8'));
        expect(parsed).toMatchObject(baseline);
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
        await generate(model, options, dmmf);

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

        expect(api.paths?.['/myapi/user']).toBeTruthy();
    });

    it('security schemes valid', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${process.cwd()}/dist'
    securitySchemes = { 
        myBasic: { type: 'http', scheme: 'basic' },
        myBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        myApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }
    }
}

model User {
    id String @id
    posts Post[]
}

model Post {
    id String @id
    author User @relation(fields: [authorId], references: [id])
    authorId String
    @@allow('read', true)
}
`);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.components.securitySchemes).toEqual(
            expect.objectContaining({
                myBasic: { type: 'http', scheme: 'basic' },
                myBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
                myApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            })
        );
        expect(parsed.security).toEqual(expect.arrayContaining([{ myBasic: [] }, { myBearer: [] }]));

        const api = await OpenAPIParser.validate(output);
        expect(api.paths?.['/user']?.['get']?.security).toBeUndefined();
        expect(api.paths?.['/user/{id}/posts']?.['get']?.security).toEqual([]);
        expect(api.paths?.['/post']?.['get']?.security).toEqual([]);
        expect(api.paths?.['/post']?.['post']?.security).toBeUndefined();
    });

    it('security schemes invalid', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${process.cwd()}/dist'
    securitySchemes = { 
        myBasic: { type: 'invalid', scheme: 'basic' }
    }
}

model User {
    id String @id
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await expect(generate(model, options, dmmf)).rejects.toEqual(
            expect.objectContaining({ message: expect.stringContaining('"securitySchemes" option is invalid') })
        );
    });

    it('ignored model used as relation', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${process.cwd()}/dist'
}

model User {
    id String @id
    email String @unique
    posts Post[]
}

model Post {
    id String @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?

    @@openapi.ignore()
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });

        const options = buildOptions(model, modelFile, output, '3.1.0');
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        await OpenAPIParser.validate(output);
    });
});

function buildOptions(model: Model, modelFile: string, output: string, specVersion = '3.0.0') {
    const optionFields = model.declarations.find((d): d is Plugin => isPlugin(d))?.fields || [];
    const options: any = { schemaPath: modelFile, output, specVersion, flavor: 'restful' };
    optionFields.forEach((f) => (options[f.name] = getLiteral(f.value) ?? getObjectLiteral(f.value)));
    return options;
}
