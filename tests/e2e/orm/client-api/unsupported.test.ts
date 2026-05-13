import path from 'node:path';
import { createQuerySchemaFactory } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from '../schemas/unsupported/schema';

describe('Unsupported field exclusion - Zod runtime validation', () => {
    const factory = createQuerySchemaFactory(schema);

    describe('Zod schemas', () => {
        // #region Where schemas

        describe('where schema', () => {
            it('rejects Unsupported fields in where filter', () => {
                const s = factory.makeFindManySchema('Item');

                // valid filter on regular field
                expect(s.safeParse({ where: { name: 'test' } }).success).toBe(true);

                // Unsupported field should be rejected
                expect(s.safeParse({ where: { data: 'some_value' } }).success).toBe(false);
            });

            it('rejects Unsupported fields in where filter (required Unsupported)', () => {
                const s = factory.makeFindManySchema('GeoRecord');
                expect(s.safeParse({ where: { title: 'test' } }).success).toBe(true);
                expect(s.safeParse({ where: { extra: 'some_value' } }).success).toBe(false);
            });
        });

        // #endregion

        // #region Select schemas

        describe('select schema', () => {
            it('rejects Unsupported fields in select', () => {
                const s = factory.makeFindManySchema('Item');

                // valid select
                expect(s.safeParse({ select: { id: true, name: true } }).success).toBe(true);

                // Unsupported field in select should be rejected
                expect(s.safeParse({ select: { data: true } }).success).toBe(false);
            });
        });

        // #endregion

        // #region Omit schemas

        describe('omit schema', () => {
            it('rejects Unsupported fields in omit', () => {
                const s = factory.makeFindManySchema('Item');

                // valid omit
                expect(s.safeParse({ omit: { name: true } }).success).toBe(true);

                // Unsupported field in omit should be rejected
                expect(s.safeParse({ omit: { data: true } }).success).toBe(false);
            });
        });

        // #endregion

        // #region OrderBy schemas

        describe('orderBy schema', () => {
            it('rejects Unsupported fields in orderBy', () => {
                const s = factory.makeFindManySchema('Item');

                // valid orderBy
                expect(s.safeParse({ orderBy: { name: 'asc' } }).success).toBe(true);

                // Unsupported field in orderBy should be rejected
                expect(s.safeParse({ orderBy: { data: 'asc' } }).success).toBe(false);
            });
        });

        // #endregion

        // #region Create schemas

        describe('create schema', () => {
            it('rejects Unsupported fields in create data (optional Unsupported)', () => {
                const s = factory.makeCreateSchema('Item');

                // valid create
                expect(s.safeParse({ data: { name: 'test' } }).success).toBe(true);

                // Unsupported field in create data should be rejected
                expect(s.safeParse({ data: { name: 'test', data: 'some_value' } }).success).toBe(false);
            });

            it('rejects Unsupported fields in create data (required Unsupported with default)', () => {
                const s = factory.makeCreateSchema('GeoRecordWithDefault');

                // valid create (required Unsupported has default, so it's not required in input)
                expect(s.safeParse({ data: { label: 'test' } }).success).toBe(true);

                // Unsupported field in create data should still be rejected
                expect(s.safeParse({ data: { label: 'test', area: 'some_value' } }).success).toBe(false);
            });
        });

        // #endregion

        // #region Update schemas

        describe('update schema', () => {
            it('rejects Unsupported fields in update data', () => {
                const s = factory.makeUpdateSchema('Item');

                // valid update
                expect(s.safeParse({ where: { id: 1 }, data: { name: 'updated' } }).success).toBe(true);

                // Unsupported field in update data should be rejected
                expect(s.safeParse({ where: { id: 1 }, data: { data: 'some_value' } }).success).toBe(false);
            });
        });

        // #endregion

        // #region Distinct schema

        describe('distinct schema', () => {
            it('rejects Unsupported fields in distinct', () => {
                const s = factory.makeFindManySchema('Item');

                // valid distinct
                expect(s.safeParse({ distinct: 'name' }).success).toBe(true);

                // Unsupported field in distinct should be rejected
                expect(s.safeParse({ distinct: 'data' }).success).toBe(false);
            });
        });

        // #endregion

        // #region Aggregate schemas

        describe('aggregate schema', () => {
            it('rejects Unsupported fields in aggregate min/max', () => {
                const s = factory.makeAggregateSchema('Item');

                // valid min/max on regular field
                expect(s.safeParse({ _min: { name: true } }).success).toBe(true);
                expect(s.safeParse({ _max: { name: true } }).success).toBe(true);

                // Unsupported field in aggregate should be rejected
                expect(s.safeParse({ _min: { data: true } }).success).toBe(false);
                expect(s.safeParse({ _max: { data: true } }).success).toBe(false);
            });

            it('rejects Unsupported fields in aggregate count', () => {
                const s = factory.makeAggregateSchema('Item');

                // valid count
                expect(s.safeParse({ _count: { name: true } }).success).toBe(true);

                // Unsupported field in count should be rejected
                expect(s.safeParse({ _count: { data: true } }).success).toBe(false);
            });
        });

        // #endregion

        // #region GroupBy schemas

        describe('groupBy schema', () => {
            it('rejects Unsupported fields in groupBy by', () => {
                const s = factory.makeGroupBySchema('Item');

                // valid groupBy
                expect(s.safeParse({ by: 'name' }).success).toBe(true);

                // Unsupported field in groupBy should be rejected
                expect(s.safeParse({ by: 'data' }).success).toBe(false);
            });
        });

        // #endregion
    });

    const schemaFile = path.join(__dirname, '../schemas/unsupported/schema.zmodel');
    const clientOptions = { provider: 'postgresql' as const, usePrismaPush: true, schemaFile };

    describe('ORM calls', () => {
        let db: Awaited<ReturnType<typeof createTestClient<typeof schema, any>>>;

        beforeEach(async () => {
            db = await createTestClient(schema, clientOptions);
        });

        afterEach(async () => {
            await db?.$disconnect();
        });

        it('rejects Unsupported fields in findMany where', async () => {
            // valid call
            await db.item.findMany({ where: { name: 'test' } });
            // @ts-expect-error data (Unsupported) should not be in where
            await expect(db.item.findMany({ where: { data: 'val' } })).toBeRejectedByValidation();
        });

        it('rejects Unsupported fields in select', async () => {
            // valid call
            await db.item.findMany({ select: { id: true, name: true } });
            await expect(db.item.findMany({ select: { data: true } })).toBeRejectedByValidation();
        });

        it('rejects Unsupported fields in omit', async () => {
            // valid call
            await db.item.findMany({ omit: { name: true } });
            // @ts-expect-error data (Unsupported) should not be in omit
            await expect(db.item.findMany({ omit: { data: true } })).toBeRejectedByValidation();
        });

        it('rejects Unsupported fields in orderBy', async () => {
            // valid call
            await db.item.findMany({ orderBy: { name: 'asc' } });
            await expect(db.item.findMany({ orderBy: { data: 'asc' } })).toBeRejectedByValidation();
        });

        it('rejects Unsupported fields in create data', async () => {
            // valid call
            await db.item.create({ data: { name: 'test' } });
            await expect(db.item.create({ data: { name: 'test', data: 'val' } })).toBeRejectedByValidation();
        });

        it('rejects Unsupported fields in update data', async () => {
            const item = await db.item.create({ data: { name: 'test' } });
            // valid call
            await db.item.update({ where: { id: item.id }, data: { name: 'updated' } });
            await expect(db.item.update({ where: { id: item.id }, data: { data: 'val' } })).toBeRejectedByValidation();
        });

        it('blocks create on model with required Unsupported field', () => {
            // create should not exist on geoRecord (required Unsupported without default)
            // @ts-expect-error create should not be defined
            expect(db.geoRecord.create).toBeUndefined();
        });

        it('blocks upsert on model with required Unsupported field', () => {
            // upsert should not exist on geoRecord (required Unsupported without default)
            // @ts-expect-error upsert should not be defined
            expect(db.geoRecord.upsert).toBeUndefined();
        });

        it('rejects nested create for model with required Unsupported field', async () => {
            await expect(
                db.geoParent.create({
                    data: {
                        name: 'parent',
                        // @ts-expect-error create should not be allowed for GeoRecord (required Unsupported)
                        records: { create: { title: 'test' } },
                    },
                }),
            ).toBeRejectedByValidation();
        });

        it('rejects nested connectOrCreate for model with required Unsupported field', async () => {
            await expect(
                db.geoParent.create({
                    data: {
                        name: 'parent',
                        // @ts-expect-error connectOrCreate should not be allowed for GeoRecord (required Unsupported)
                        records: { connectOrCreate: { where: { id: 1 }, create: { title: 'test' } } },
                    },
                }),
            ).toBeRejectedByValidation();
        });

        it('allows create on model with required Unsupported field that has default', async () => {
            // GeoRecordWithDefault has a required Unsupported with @default(dbgenerated(...)),
            // so create should be allowed at type level and runtime
            const record = await db.geoRecordWithDefault.create({ data: { label: 'test' } });
            expect(record.label).toBe('test');
        });
    });
});
