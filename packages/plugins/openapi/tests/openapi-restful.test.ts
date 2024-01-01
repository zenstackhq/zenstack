/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import OpenAPIParser from '@readme/openapi-parser';
import { getLiteral, getObjectLiteral } from '@zenstackhq/sdk';
import { Model, Plugin, isPlugin } from '@zenstackhq/sdk/ast';
import { loadZModelAndDmmf } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import * as tmp from 'tmp';
import YAML from 'yaml';
import generate from '../src';

describe('Open API Plugin RESTful Tests', () => {
    it('run plugin', async () => {
        for (const specVersion of ['3.0.0', '3.1.0']) {
            const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${path.resolve(__dirname, '../dist')}'
    specVersion = '${specVersion}'
}

enum role {
    USER
    ADMIN
}

model User {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique
    role role @default(USER)
    posts post_Item[]
    profile Profile?
}

model Profile {
    id String @id @default(cuid())
    image String?

    user User @relation(fields: [userId], references: [id])
    userId String @unique
}

model post_Item {
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
    notes String?

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

            console.log(`OpenAPI specification generated for ${specVersion}: ${output}`);

            const api = await OpenAPIParser.validate(output);

            expect(api.tags).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'user', description: 'User operations' }),
                    expect.objectContaining({ name: 'post_Item', description: 'Post-related operations' }),
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
            expect(api.paths?.['/post_Item/{id}/relationships/author']?.['get']).toBeTruthy();
            expect(api.paths?.['/post_Item/{id}/relationships/author']?.['post']).toBeUndefined();
            expect(api.paths?.['/post_Item/{id}/relationships/author']?.['patch']).toBeTruthy();
            expect(api.paths?.['/foo']).toBeUndefined();
            expect(api.paths?.['/bar']).toBeUndefined();

            const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
            expect(parsed.openapi).toBe(specVersion);
            const baseline = YAML.parse(
                fs.readFileSync(`${__dirname}/baseline/rest-${specVersion}.baseline.yaml`, 'utf-8')
            );
            expect(parsed).toMatchObject(baseline);
        }
    });

    it('options', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${path.resolve(__dirname, '../dist')}'
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
    provider = '${path.resolve(__dirname, '../dist')}'
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

    it('security model level override', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${path.resolve(__dirname, '../dist')}'
    securitySchemes = { 
        myBasic: { type: 'http', scheme: 'basic' }
    }
}

model User {
    id String @id
    value Int

    @@allow('all', value > 0)

    @@openapi.meta({
        security: []
    })
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const api = await OpenAPIParser.validate(output);
        expect(api.paths?.['/user']?.['get']?.security).toHaveLength(0);
        expect(api.paths?.['/user/{id}']?.['put']?.security).toHaveLength(0);
    });

    it('security schemes invalid', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${path.resolve(__dirname, '../dist')}'
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
    provider = '${path.resolve(__dirname, '../dist')}'
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

    it('field type coverage', async () => {
        for (const specVersion of ['3.0.0', '3.1.0']) {
            const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${path.resolve(__dirname, '../dist')}'
    specVersion = '${specVersion}'
}

model Foo {
    id String @id @default(cuid())
    
    string String
    int Int
    bigInt BigInt
    date DateTime
    float Float
    decimal Decimal
    boolean Boolean
    bytes Bytes

    @@allow('all', true)
}
        `);

            const { name: output } = tmp.fileSync({ postfix: '.yaml' });

            const options = buildOptions(model, modelFile, output, '3.1.0');
            await generate(model, options, dmmf);

            console.log(`OpenAPI specification generated for ${specVersion}: ${output}`);

            await OpenAPIParser.validate(output);

            const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
            expect(parsed.openapi).toBe(specVersion);
            const baseline = YAML.parse(
                fs.readFileSync(`${__dirname}/baseline/rest-type-coverage-${specVersion}.baseline.yaml`, 'utf-8')
            );
            expect(parsed).toMatchObject(baseline);
        }
    });
});

function buildOptions(model: Model, modelFile: string, output: string, specVersion = '3.0.0') {
    const optionFields = model.declarations.find((d): d is Plugin => isPlugin(d))?.fields || [];
    const options: any = { schemaPath: modelFile, output, specVersion, flavor: 'rest' };
    optionFields.forEach((f) => (options[f.name] = getLiteral(f.value) ?? getObjectLiteral(f.value)));
    return options;
}
