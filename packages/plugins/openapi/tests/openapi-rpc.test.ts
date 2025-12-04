/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import OpenAPIParser from '@readme/openapi-parser';
import { getLiteral, getObjectLiteral } from '@zenstackhq/sdk';
import { Model, Plugin, isPlugin } from '@zenstackhq/sdk/ast';
import { loadSchema, loadZModelAndDmmf, normalizePath } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import * as tmp from 'tmp';
import YAML from 'yaml';
import generate from '../src';

tmp.setGracefulCleanup();

describe('Open API Plugin RPC Tests', () => {
    it('run plugin', async () => {
        for (const specVersion of ['3.0.0', '3.1.0']) {
            for (const omitInputDetails of [true, false]) {
                const { projectDir } = await loadSchema(
                    `
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    specVersion = '${specVersion}'
    omitInputDetails = ${omitInputDetails}
    output = '$projectRoot/openapi.yaml'
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

    @@openapi.meta({
        findMany: {
            description: 'Find users matching the given conditions'
        },
        delete: {
            method: 'put',
            path: 'dodelete',
            description: 'Delete a unique user',
            summary: 'Delete a user yeah yeah',
            tags: ['delete', 'user'],
            deprecated: true
        },
    })
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
        tagDescription: 'Post-related operations',
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
        `,
                    { provider: 'postgresql', pushDb: false }
                );

                console.log(
                    `OpenAPI specification generated for ${specVersion}${
                        omitInputDetails ? ' - omit' : ''
                    }: ${projectDir}/openapi.yaml`
                );

                const parsed = YAML.parse(fs.readFileSync(path.join(projectDir, 'openapi.yaml'), 'utf-8'));
                expect(parsed.openapi).toBe(specVersion);
                const baseline = YAML.parse(
                    fs.readFileSync(
                        `${__dirname}/baseline/rpc-${specVersion}${omitInputDetails ? '-omit' : ''}.baseline.yaml`,
                        'utf-8'
                    )
                );
                expect(parsed).toMatchObject(baseline);

                const api = await OpenAPIParser.validate(path.join(projectDir, 'openapi.yaml'));

                expect(api.tags).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ name: 'user', description: 'User operations' }),
                        expect.objectContaining({ name: 'post_Item', description: 'Post-related operations' }),
                    ])
                );

                expect(api.paths?.['/user/findMany']?.['get']?.description).toBe(
                    'Find users matching the given conditions'
                );
                const del = api.paths?.['/user/dodelete']?.['put'];
                expect(del?.description).toBe('Delete a unique user');
                expect(del?.summary).toBe('Delete a user yeah yeah');
                expect(del?.tags).toEqual(expect.arrayContaining(['delete', 'user']));
                expect(del?.deprecated).toBe(true);
                expect(api.paths?.['/post/findMany']).toBeUndefined();
                expect(api.paths?.['/foo/findMany']).toBeUndefined();
                expect(api.paths?.['/bar/findMany']).toBeUndefined();
            }
        }
    });

    it('options', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
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

        expect(api.paths?.['/myapi/user/findMany']).toBeTruthy();
    });

    it('security schemes valid', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    securitySchemes = { 
        myBasic: { type: 'http', scheme: 'basic' },
        myBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        myApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' }
    }
}

model User {
    id String @id
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);
        await OpenAPIParser.validate(output);

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.components.securitySchemes).toEqual(
            expect.objectContaining({
                myBasic: { type: 'http', scheme: 'basic' },
                myBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
                myApiKey: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            })
        );
        expect(parsed.security).toEqual(expect.arrayContaining([{ myBasic: [] }, { myBearer: [] }]));
    });

    it('security schemes invalid', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
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

    it('security model level override', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    securitySchemes = { 
        myBasic: { type: 'http', scheme: 'basic' }
    }
}

model User {
    id String @id

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
        expect(api.paths?.['/user/findMany']?.['get']?.security).toHaveLength(0);
    });

    it('security operation level override', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    securitySchemes = { 
        myBasic: { type: 'http', scheme: 'basic' }
    }
}

model User {
    id String @id

    @@allow('read', true)

    @@openapi.meta({
        security: [],
        findMany: {
            security: [{ myBasic: [] }]
        }
    })
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const api = await OpenAPIParser.validate(output);
        expect(api.paths?.['/user/findMany']?.['get']?.security).toHaveLength(1);
    });

    it('security inferred', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    securitySchemes = { 
        myBasic: { type: 'http', scheme: 'basic' }
    }
}

model User {
    id String @id
    @@allow('create', true)
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        const api = await OpenAPIParser.validate(output);
        expect(api.paths?.['/user/create']?.['post']?.security).toHaveLength(0);
        expect(api.paths?.['/user/findMany']?.['get']?.security).toBeUndefined();
    });

    it('v3.1.0 fields', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    summary = 'awesome api'
}

model User {
    id String @id
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });
        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);
        await OpenAPIParser.validate(output);

        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.openapi).toBe('3.1.0');
        expect(parsed.info.summary).toEqual('awesome api');
    });

    it('ignored model used as relation', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
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

        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);
        await OpenAPIParser.validate(output);
    });

    it('field type coverage', async () => {
        for (const specVersion of ['3.0.0', '3.1.0']) {
            const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    specVersion = '${specVersion}'
}

type Meta {
    something String
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
    bytes Bytes?
    json Meta? @json
    plainJson Json

    @@allow('all', true)
}
        `);

            const { name: output } = tmp.fileSync({ postfix: '.yaml' });

            const options = buildOptions(model, modelFile, output);
            await generate(model, options, dmmf);

            console.log(`OpenAPI specification generated for ${specVersion}: ${output}`);

            await OpenAPIParser.validate(output);

            const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
            expect(parsed.openapi).toBe(specVersion);
            const baseline = YAML.parse(
                fs.readFileSync(`${__dirname}/baseline/rpc-type-coverage-${specVersion}.baseline.yaml`, 'utf-8')
            );
            expect(parsed).toMatchObject(baseline);
        }
    });

    it('complex TypeDef structures', async () => {
        for (const specVersion of ['3.0.0', '3.1.0']) {
            const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    specVersion = '${specVersion}'
}

enum Status {
    PENDING
    APPROVED
    REJECTED
}

type Address {
    street String
    city String
    country String
    zipCode String?
}

type ContactInfo {
    email String
    phone String?
    addresses Address[]
}

type ReviewItem {
    id String
    status Status
    reviewer ContactInfo
    score Int
    comments String[]
    metadata Json?
}

type ComplexData {
    reviews ReviewItem[]
    primaryContact ContactInfo
    tags String[]
    settings Json
}

model Product {
    id String @id @default(cuid())
    name String
    data ComplexData @json
    simpleJson Json

    @@allow('all', true)
}
        `);

            const { name: output } = tmp.fileSync({ postfix: '.yaml' });

            const options = buildOptions(model, modelFile, output);
            await generate(model, options, dmmf);

            await OpenAPIParser.validate(output);

            const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
            expect(parsed.openapi).toBe(specVersion);
            
            // Verify all TypeDefs are generated
            expect(parsed.components.schemas.Address).toBeDefined();
            expect(parsed.components.schemas.ContactInfo).toBeDefined();
            expect(parsed.components.schemas.ReviewItem).toBeDefined();
            expect(parsed.components.schemas.ComplexData).toBeDefined();
            
            // Verify enum reference in TypeDef
            expect(parsed.components.schemas.ReviewItem.properties.status.$ref).toBe('#/components/schemas/Status');
            
            // Json field inside a TypeDef should remain generic (wrapped with nullable since it's optional)
            // OpenAPI 3.1 uses oneOf with null type, while 3.0 uses nullable: true
            if (specVersion === '3.1.0') {
                expect(parsed.components.schemas.ReviewItem.properties.metadata).toEqual({
                    oneOf: [
                        { type: 'null' },
                        {}
                    ]
                });
            } else {
                expect(parsed.components.schemas.ReviewItem.properties.metadata).toEqual({ nullable: true });
            }
            
            // Verify nested TypeDef references
            expect(parsed.components.schemas.ContactInfo.properties.addresses.type).toBe('array');
            expect(parsed.components.schemas.ContactInfo.properties.addresses.items.$ref).toBe('#/components/schemas/Address');
            
            // Verify array of complex objects
            expect(parsed.components.schemas.ComplexData.properties.reviews.type).toBe('array');
            expect(parsed.components.schemas.ComplexData.properties.reviews.items.$ref).toBe('#/components/schemas/ReviewItem');
            
            // Verify the Product model references the ComplexData TypeDef
            expect(parsed.components.schemas.Product.properties.data.$ref).toBe('#/components/schemas/ComplexData');
            
            // Verify plain Json field remains generic
            expect(parsed.components.schemas.Product.properties.simpleJson).toEqual({});
        }
    });

    it('array of TypeDef with enum directly on model field', async () => {
        for (const specVersion of ['3.0.0', '3.1.0']) {
            const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    specVersion = '${specVersion}'
}

enum Language {
    FR
    EN
    ES
    DE
    IT
}

type TranslatedField {
    language Language
    content String
}

model Article {
    id String @id @default(cuid())
    title TranslatedField[] @json
    description TranslatedField[] @json

    @@allow('all', true)
}
        `);

            const { name: output } = tmp.fileSync({ postfix: '.yaml' });

            const options = buildOptions(model, modelFile, output);
            await generate(model, options, dmmf);

            await OpenAPIParser.validate(output);

            const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
            expect(parsed.openapi).toBe(specVersion);

            // Verify TranslatedField TypeDef is generated
            expect(parsed.components.schemas.TranslatedField).toBeDefined();

            // Verify Language enum is generated
            expect(parsed.components.schemas.Language).toBeDefined();

            // Verify enum reference inside TranslatedField
            expect(parsed.components.schemas.TranslatedField.properties.language.$ref).toBe('#/components/schemas/Language');

            // Verify array of TypeDef directly on model field
            expect(parsed.components.schemas.Article.properties.title.type).toBe('array');
            expect(parsed.components.schemas.Article.properties.title.items.$ref).toBe('#/components/schemas/TranslatedField');

            // Verify second array field as well
            expect(parsed.components.schemas.Article.properties.description.type).toBe('array');
            expect(parsed.components.schemas.Article.properties.description.items.$ref).toBe('#/components/schemas/TranslatedField');
        }
    });

    it('full-text search', async () => {
        const { model, dmmf, modelFile } = await loadZModelAndDmmf(`
generator js {
    provider = 'prisma-client-js'
    previewFeatures = ['fullTextSearch']
}
        
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
}

enum role {
    USER
    ADMIN
}

model User {
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique
    role role @default(USER)
    posts post_Item[]
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
}
        `);

        const { name: output } = tmp.fileSync({ postfix: '.yaml' });

        const options = buildOptions(model, modelFile, output);
        await generate(model, options, dmmf);

        console.log('OpenAPI specification generated:', output);

        await OpenAPIParser.validate(output);
    });

    it('auth() in @default()', async () => {
        const { projectDir } = await loadSchema(`
plugin openapi {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/openapi.yaml'
    flavor = 'rpc'
}

model User {
    id Int @id
    posts Post[]
}

model Post {
    id Int @id
    title String
    author User @relation(fields: [authorId], references: [id])
    authorId Int @default(auth().id)
}
        `);

        const output = path.join(projectDir, 'openapi.yaml');
        console.log('OpenAPI specification generated:', output);

        await OpenAPIParser.validate(output);
        const parsed = YAML.parse(fs.readFileSync(output, 'utf-8'));
        expect(parsed.components.schemas.PostCreateInput.required).not.toContain('author');
        expect(parsed.components.schemas.PostCreateManyInput.required).not.toContain('authorId');
    });
});

function buildOptions(model: Model, modelFile: string, output: string) {
    const optionFields = model.declarations.find((d): d is Plugin => isPlugin(d))?.fields || [];
    const options: any = { schemaPath: modelFile, output, flavor: 'rpc' };
    optionFields.forEach((f) => (options[f.name] = getLiteral(f.value) ?? getObjectLiteral(f.value)));
    return options;
}
