import { loadSchema } from '@zenstackhq/testtools';
import { POLYMORPHIC_SCHEMA } from './utils';
import path from 'path';

describe('Polymorphic Plugin Interaction Test', () => {
    it('tanstack-query', async () => {
        const tanstackPlugin = path.resolve(__dirname, '../../../../../packages/plugins/tanstack-query/dist');
        const schema = `
        ${POLYMORPHIC_SCHEMA}

        plugin hooks {
            provider = '${tanstackPlugin}'
            output = '$projectRoot/hooks'
            target = 'react'
            version = 'v5'
        }
        `;

        await loadSchema(schema, {
            compile: true,
            copyDependencies: [tanstackPlugin],
            extraDependencies: ['@tanstack/react-query'],
        });
    });

    it('swr', async () => {
        const schema = `
        ${POLYMORPHIC_SCHEMA}

        plugin hooks {
            provider = '@zenstackhq/swr'
            output = '$projectRoot/hooks'
        }
        `;

        await loadSchema(schema, {
            compile: true,
            extraDependencies: ['swr'],
        });
    });

    it('trpc', async () => {
        const schema = `
        ${POLYMORPHIC_SCHEMA}

        plugin trpc {
            provider = '@zenstackhq/trpc'
            output = '$projectRoot/routers'
            generateClientHelpers = 'react'
        }
        `;

        await loadSchema(schema, {
            compile: true,
            extraDependencies: ['@trpc/client', '@trpc/server', '@trpc/react-query'],
        });
    });

    it('zod', async () => {
        const { zodSchemas } = await loadSchema(POLYMORPHIC_SCHEMA, { fullZod: true });

        // model schema
        expect(
            zodSchemas.models.AssetSchema.parse({
                id: 1,
                assetType: 'video',
                createdAt: new Date(),
                viewCount: 100,
            })
        ).toBeTruthy();

        expect(
            zodSchemas.models.AssetSchema.parse({
                id: 1,
                assetType: 'video',
                createdAt: new Date(),
                viewCount: 100,
                videoType: 'ratedVideo', // should be stripped
            }).videoType
        ).toBeUndefined();

        expect(
            zodSchemas.models.VideoSchema.parse({
                id: 1,
                assetType: 'video',
                videoType: 'ratedVideo',
                duration: 100,
                url: 'http://example.com',
                createdAt: new Date(),
                viewCount: 100,
            })
        ).toBeTruthy();

        expect(() =>
            zodSchemas.models.VideoSchema.parse({
                id: 1,
                assetType: 'video',
                videoType: 'ratedVideo',
                url: 'http://example.com',
                createdAt: new Date(),
                viewCount: 100,
            })
        ).toThrow('duration');

        // create schema
        expect(
            zodSchemas.models.VideoCreateSchema.parse({
                duration: 100,
                url: 'http://example.com',
            }).assetType // discriminator should not be set
        ).toBeUndefined();

        // update schema
        expect(
            zodSchemas.models.VideoUpdateSchema.parse({
                duration: 100,
                url: 'http://example.com',
            }).assetType // discriminator should not be set
        ).toBeUndefined();

        // prisma create schema
        expect(
            zodSchemas.models.VideoPrismaCreateSchema.strip().parse({
                assetType: 'video',
            }).assetType // discriminator should not be set
        ).toBeUndefined();

        // input object schema
        expect(
            zodSchemas.objects.RatedVideoCreateInputObjectSchema.parse({
                duration: 100,
                viewCount: 200,
                url: 'http://www.example.com',
                rating: 5,
            })
        ).toBeTruthy();

        expect(() =>
            zodSchemas.objects.RatedVideoCreateInputObjectSchema.parse({
                duration: 100,
                viewCount: 200,
                url: 'http://www.example.com',
                rating: 5,
                videoType: 'ratedVideo',
            })
        ).toThrow('videoType');
    });
});
