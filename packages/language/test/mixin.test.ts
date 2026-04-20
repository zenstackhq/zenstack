import { invariant } from '@zenstackhq/common-helpers';
import fs from 'node:fs';
import path from 'node:path';
import tmp from 'tmp';
import { describe, expect, it } from 'vitest';
import { loadDocument } from '../src';
import { DataModel, TypeDef } from '../src/ast';
import { getAllFields } from '../src/utils';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Mixin Tests', () => {
    it('supports model mixing types to Model', async () => {
        const model = await loadSchema(`
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        type A {
            x String
        }

        type B {
            y String
        }

        model M with A B {
            id String @id
        }
        `);
        const m = model.declarations.find((d) => d.name === 'M') as DataModel;
        expect(m.mixins.length).toBe(2);
        expect(m.mixins[0].ref?.name).toBe('A');
        expect(m.mixins[1].ref?.name).toBe('B');
    });

    it('supports model mixing types to type', async () => {
        const model = await loadSchema(`
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        type A {
            x String
        }

        type B {
            y String
        }

        type C with A B {
            z String
        }

        model M with C {
            id String @id
        }
        `);
        const c = model.declarations.find((d) => d.name === 'C') as TypeDef;
        expect(c?.mixins.length).toBe(2);
        expect(c?.mixins[0].ref?.name).toBe('A');
        expect(c?.mixins[1].ref?.name).toBe('B');
        const m = model.declarations.find((d) => d.name === 'M') as DataModel;
        expect(m.mixins[0].ref?.name).toBe('C');
    });

    it('can detect cyclic mixins', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        type A with B {
            x String
        }

        type B with A {
            y String
        }

        model M with A {
            id String @id
        }
        `,
            'cyclic',
        );
    });

    it('can detect duplicated fields from mixins', async () => {
        await loadSchemaWithError(
            `
        type A {
            x String
        }

        type B {
            x String
        }

        model M with A B {
            id String @id
        }
        `,
            'duplicated',
        );
    });

    it('can detect duplicated attributes from mixins', async () => {
        await loadSchemaWithError(
            `
        type A {
            x String
            @@id([x])
        }

        type B {
            y String
            @@id([y])
        }

        model M with A B {
        }
        `,
            'can only be applied once',
        );
    });

    it('allows relation fields in type', async () => {
        await loadSchema(`
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        model User {
            id Int @id @default(autoincrement())
        }

        type T {
            u User
        }
        `);
    });

    it('allows multiple models to mixin a type with relation fields', async () => {
        await loadSchema(`
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        type WithComments {
            comments Comment[]
        }

        model Post with WithComments {
            id Int @id @default(autoincrement())
        }

        model Article with WithComments {
            id Int @id @default(autoincrement())
        }

        model Comment {
            id Int @id @default(autoincrement())
            post     Post?    @relation(fields: [postId], references: [id])
            postId   Int?
            article  Article? @relation(fields: [articleId], references: [id])
            articleId Int?
        }
        `);
    });

    it('rejects type with relation fields when used as JSON field type', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        model User {
            id Int @id @default(autoincrement())
        }

        type WithRelation {
            user User
        }

        model Post {
            id       Int          @id @default(autoincrement())
            metadata WithRelation @json
        }
        `,
            'Type used as JSON field type cannot have relation fields',
        );
    });

    it('rejects type with transitively-nested relation fields when used as JSON field type', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        model User {
            id Int @id @default(autoincrement())
        }

        type Inner {
            user User
        }

        type Outer {
            inner Inner
        }

        model Post {
            id       Int   @id @default(autoincrement())
            metadata Outer @json
        }
        `,
            'Type used as JSON field type cannot have relation fields',
        );
    });

    it('supports mixin fields from imported file', async () => {
        const { name } = tmp.dirSync();

        fs.writeFileSync(
            path.join(name, 'base.zmodel'),
            `
type Timestamped {
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
            `,
        );

        fs.writeFileSync(
            path.join(name, 'main.zmodel'),
            `
import './base'

datasource db {
    provider = 'sqlite'
    url = 'file:./dev.db'
}

model Post with Timestamped {
    id String @id
    title String
}
            `,
        );

        const model = await expectLoaded(path.join(name, 'main.zmodel'));
        const post = model.declarations.find((d) => d.name === 'Post') as DataModel;
        expect(post.mixins[0].ref?.name).toBe('Timestamped');

        // Verify fields from imported mixin are accessible
        const allFields = getAllFields(post);
        expect(allFields.map((f) => f.name)).toContain('createdAt');
        expect(allFields.map((f) => f.name)).toContain('updatedAt');
    });

    it('can reference imported mixin fields in policy rules', async () => {
        const { name } = tmp.dirSync();

        fs.writeFileSync(
            path.join(name, 'base.zmodel'),
            `
type Owned {
    ownerId String
}
            `,
        );

        fs.writeFileSync(
            path.join(name, 'main.zmodel'),
            `
import './base'

datasource db {
    provider = 'sqlite'
    url = 'file:./dev.db'
}

model User {
    id String @id
    @@auth()
}

model Post with Owned {
    id String @id

    @@allow('update', auth().id == ownerId)
}
            `,
        );

        // If this loads without "Could not resolve reference" error, the fix works
        const model = await expectLoaded(path.join(name, 'main.zmodel'));
        expect(model).toBeDefined();
    });

    async function expectLoaded(file: string) {
        const pluginDocs = [path.resolve(__dirname, '../../plugins/policy/plugin.zmodel')];
        const result = await loadDocument(file, pluginDocs);
        if (!result.success) {
            console.error('Errors:', result.errors);
            throw new Error(`Failed to load document from ${file}`);
        }
        invariant(result.success);
        return result.model;
    }
});
