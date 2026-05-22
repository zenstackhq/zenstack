import { describe, expect, it } from 'vitest';
import { DataModel } from '../src/ast';
import { loadSchema, loadSchemaWithError } from './utils';

describe('Delegate Tests', () => {
    it('supports inheriting from delegate', async () => {
        const model = await loadSchema(`
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A {
            id Int @id @default(autoincrement())
            x String
            @@delegate(x)
        }

        model B extends A {
            y String
        }
        `);
        const a = model.declarations.find((d) => d.name === 'A') as DataModel;
        expect(a.baseModel).toBeUndefined();
        const b = model.declarations.find((d) => d.name === 'B') as DataModel;
        expect(b.baseModel?.ref).toBe(a);
    });

    it('rejects inheriting from non-delegate models', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A {
            id Int @id @default(autoincrement())
            x String
        }

        model B extends A {
            y String
        }
        `,
            'not a delegate model',
        );
    });

    it('can detect cyclic inherits', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A extends B {
            x String
            @@delegate(x)
        }

        model B extends A {
            y String
            @@delegate(y)
        }
        `,
            'cyclic',
        );
    });

    it('can detect duplicated fields from base model', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A {
            id String @id
            x String
            @@delegate(x)
        }

        model B extends A {
            x String
        }
        `,
            'duplicated',
        );
    });

    it('can detect duplicated attributes from base model', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A {
            id String @id
            x String
            @@id([x])
            @@delegate(x)
        }

        model B extends A {
            y String
            @@id([y])
        }
        `,
            'can only be applied once',
        );
    });

    it('rejects relation missing the opposite side', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A {
            id Int @id @default(autoincrement())
            b B @relation(fields: [bId], references: [id])
            bId Int
            type String
            @@delegate(type)
        }

        model B {
            id Int @id @default(autoincrement())
        }
        `,
            'missing an opposite relation',
        );

        await loadSchema(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }
        
        model A {
            id Int @id @default(autoincrement())
            b B @relation(fields: [bId], references: [id])
            bId Int
            type String
            @@delegate(type)
        }

        model B {
            id Int @id @default(autoincrement())
            a A[]
        }

        model C extends A {
            c String
        }
        `,
        );
    });

    it('supports delegate map values', async () => {
        await loadSchema(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        enum AssetType {
            ASSET_KIND_VIDEO
            ASSET_KIND_IMAGE
        }

        model Asset {
            id   Int       @id @default(autoincrement())
            type AssetType
            @@delegate(type)
        }

        model Video extends Asset {
            url String
            @@delegateMap(ASSET_KIND_VIDEO)
        }

        model Image extends Asset {
            format String
            @@delegateMap(ASSET_KIND_IMAGE)
        }
        `,
        );
    });

    it('allows partial delegate map values', async () => {
        await loadSchema(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        model Asset {
            id   Int    @id @default(autoincrement())
            type String
            @@delegate(type)
        }

        model Video extends Asset {
            url String
            @@delegateMap("video")
        }

        model Image extends Asset {
            format String
        }
        `,
        );
    });

    it('rejects duplicate delegate map values', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        model Asset {
            id   Int    @id @default(autoincrement())
            type String
            @@delegate(type)
        }

        model Video extends Asset {
            url String
            @@delegateMap("Image")
        }

        model Image extends Asset {
            format String
        }
        `,
            'Duplicate @@delegateMap value',
        );
    });

    it('rejects enum value from a different discriminator enum', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        enum AssetType {
            ASSET_KIND_VIDEO
            ASSET_KIND_IMAGE
        }

        enum VideoType {
            VIDEO_KIND_TRAILER
        }

        model Asset {
            id   Int       @id @default(autoincrement())
            type AssetType
            @@delegate(type)
        }

        model Video extends Asset {
            url String
            @@delegateMap(VIDEO_KIND_TRAILER)
        }
        `,
            'enum value must come from the discriminator enum type',
        );
    });

    it('rejects enum value when discriminator is String', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        enum AssetType {
            ASSET_KIND_VIDEO
            ASSET_KIND_IMAGE
        }

        model Asset {
            id   Int    @id @default(autoincrement())
            type String
            @@delegate(type)
        }

        model Video extends Asset {
            url String
            @@delegateMap(ASSET_KIND_VIDEO)
        }
        `,
            'enum value cannot be used when the discriminator field is String',
        );
    });

    it('rejects string value when discriminator is enum', async () => {
        await loadSchemaWithError(
            `
        datasource db {
            provider = 'sqlite'
            url      = 'file:./dev.db'
        }

        enum AssetType {
            ASSET_KIND_VIDEO
            ASSET_KIND_IMAGE
        }

        model Asset {
            id   Int       @id @default(autoincrement())
            type AssetType
            @@delegate(type)
        }

        model Video extends Asset {
            url String
            @@delegateMap("video")
        }
        `,
            'string value must match a String discriminator field',
        );
    });
});
