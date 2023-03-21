/// <reference types="@types/jest" />

import OpenAPIParser from '@readme/openapi-parser';
import { loadZModelAndDmmf } from '@zenstackhq/testtools';
import * as tmp from 'tmp';
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
        expect(api.paths?.['/bar/findMany']).toBeUndefined();
    });
});
