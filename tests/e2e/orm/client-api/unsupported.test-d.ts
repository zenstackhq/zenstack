import type { ClientContract, CreateArgs, FindManyArgs, ModelResult, UpdateArgs } from '@zenstackhq/orm';
import { describe, expectTypeOf, it } from 'vitest';
import z from 'zod';
import { schema } from '../schemas/unsupported/schema';

type Schema = typeof schema;

declare const client: ClientContract<Schema>;

describe('Unsupported field exclusion - typing', () => {
    // #region Result types

    it('excludes Unsupported fields from result type (optional Unsupported)', () => {
        type ItemResult = ModelResult<Schema, 'Item'>;
        expectTypeOf<ItemResult>().toHaveProperty('id');
        expectTypeOf<ItemResult>().toHaveProperty('name');
        // Unsupported field should be excluded
        expectTypeOf<ItemResult>().not.toHaveProperty('data');
    });

    it('excludes Unsupported fields from result type (required Unsupported)', () => {
        type GeoResult = ModelResult<Schema, 'GeoRecord'>;
        expectTypeOf<GeoResult>().toHaveProperty('id');
        expectTypeOf<GeoResult>().toHaveProperty('title');
        // Unsupported field should be excluded
        expectTypeOf<GeoResult>().not.toHaveProperty('extra');
    });

    // #endregion

    // #region Find/Where types

    it('excludes Unsupported fields from where filter', () => {
        type FindArgs = FindManyArgs<Schema, 'Item'>;
        type Where = NonNullable<FindArgs['where']>;
        expectTypeOf<Where>().toHaveProperty('id');
        expectTypeOf<Where>().toHaveProperty('name');
        // Unsupported field should not be filterable
        expectTypeOf<Where>().not.toHaveProperty('data');
    });

    // #endregion

    // #region Select/Omit types

    it('excludes Unsupported fields from select', () => {
        type FindArgs = FindManyArgs<Schema, 'Item'>;
        type Select = NonNullable<FindArgs['select']>;
        expectTypeOf<Select>().toHaveProperty('id');
        expectTypeOf<Select>().toHaveProperty('name');
        // Unsupported field should not be selectable
        expectTypeOf<Select>().not.toHaveProperty('data');
    });

    it('excludes Unsupported fields from omit', () => {
        type FindArgs = FindManyArgs<Schema, 'Item'>;
        type Omit = NonNullable<FindArgs['omit']>;
        expectTypeOf<Omit>().toHaveProperty('id');
        expectTypeOf<Omit>().toHaveProperty('name');
        // Unsupported field should not appear in omit
        expectTypeOf<Omit>().not.toHaveProperty('data');
    });

    // #endregion

    // #region Create types

    it('excludes Unsupported fields from create data', () => {
        type Args = CreateArgs<Schema, 'Item'>;
        type Data = Args['data'];
        expectTypeOf<Data>().toHaveProperty('name');
        // Unsupported field should not be in create data
        expectTypeOf<Data>().not.toHaveProperty('data');
    });

    // #endregion

    // #region Update types

    it('excludes Unsupported fields from update data', () => {
        type Args = UpdateArgs<Schema, 'Item'>;
        type Data = Args['data'];
        expectTypeOf<Data>().toHaveProperty('name');
        // Unsupported field should not be in update data
        expectTypeOf<Data>().not.toHaveProperty('data');
    });

    // #endregion

    // #region OrderBy types

    it('excludes Unsupported fields from orderBy', () => {
        // Test orderBy via the Zod schema factory since the OrderBy type is wrapped in OrArray
        const s = client.$zod.makeFindManySchema('Item');
        type Args = NonNullable<z.infer<typeof s>>;
        type OrderBy = NonNullable<Args['orderBy']>;
        // Use assignment test: valid field should work, Unsupported should not
        const _valid: OrderBy = { name: 'asc' };
        void _valid;
        // @ts-expect-error 'data' (Unsupported) should not be in orderBy
        const _invalid: OrderBy = { data: 'asc' };
        void _invalid;
    });

    // #endregion

    // #region Operation disabling for models with required Unsupported fields

    it('disables create operations for models with required Unsupported fields', () => {
        // Item has only optional Unsupported - create should be available
        expectTypeOf(client.item).toHaveProperty('create');
        expectTypeOf(client.item).toHaveProperty('createMany');
        expectTypeOf(client.item).toHaveProperty('upsert');

        // GeoRecord has required Unsupported without default - create operations should be disabled
        expectTypeOf(client.geoRecord).not.toHaveProperty('create');
        expectTypeOf(client.geoRecord).not.toHaveProperty('createMany');
        expectTypeOf(client.geoRecord).not.toHaveProperty('createManyAndReturn');
        expectTypeOf(client.geoRecord).not.toHaveProperty('upsert');

        // GeoRecord should still have read/update/delete operations
        expectTypeOf(client.geoRecord).toHaveProperty('findMany');
        expectTypeOf(client.geoRecord).toHaveProperty('findUnique');
        expectTypeOf(client.geoRecord).toHaveProperty('update');
        expectTypeOf(client.geoRecord).toHaveProperty('delete');

        // GeoRecordWithDefault has required Unsupported WITH default - create should be available
        expectTypeOf(client.geoRecordWithDefault).toHaveProperty('create');
        expectTypeOf(client.geoRecordWithDefault).toHaveProperty('createMany');
        expectTypeOf(client.geoRecordWithDefault).toHaveProperty('upsert');
    });

    // #endregion
});
