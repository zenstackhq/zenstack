import type { CreateArgs, UpdateArgs, UpdateManyArgs } from '@zenstackhq/orm';
import { describe, expectTypeOf, it } from 'vitest';
import { schema } from '../schemas/basic';
import type {
    PostCheckedCreateInput,
    PostCheckedUpdateInput,
    PostUncheckedCreateInput,
    PostUncheckedUpdateInput,
} from '../schemas/basic/input';

type Schema = typeof schema;

describe('Checked vs unchecked input types - typing', () => {
    // #region Shape of exported input types

    it('PostUncheckedCreateInput has FK field but not relation object', () => {
        expectTypeOf<PostUncheckedCreateInput>().toHaveProperty('authorId');
        expectTypeOf<PostUncheckedCreateInput>().not.toHaveProperty('author');
    });

    it('PostCheckedCreateInput has relation object but not FK field', () => {
        expectTypeOf<PostCheckedCreateInput>().toHaveProperty('author');
        expectTypeOf<PostCheckedCreateInput>().not.toHaveProperty('authorId');
    });

    it('PostUncheckedUpdateInput has FK field but not relation object', () => {
        expectTypeOf<PostUncheckedUpdateInput>().toHaveProperty('authorId');
        expectTypeOf<PostUncheckedUpdateInput>().not.toHaveProperty('author');
    });

    it('PostCheckedUpdateInput has relation object but not FK field', () => {
        expectTypeOf<PostCheckedUpdateInput>().toHaveProperty('author');
        expectTypeOf<PostCheckedUpdateInput>().not.toHaveProperty('authorId');
    });

    // #endregion

    // #region XOR enforcement on CreateArgs['data']

    it('rejects mixing FK + relation in create data', () => {
        type CreateData = NonNullable<CreateArgs<Schema, 'Post'>['data']>;
        // @ts-expect-error - cannot mix authorId (unchecked) and author (checked) in the same object
        const _mixed: CreateData = { title: 'T', authorId: 'id1', author: { connect: { id: 'id1' } } };
    });

    it('accepts unchecked create data (FK only)', () => {
        type CreateData = NonNullable<CreateArgs<Schema, 'Post'>['data']>;
        void ({ title: 'T', authorId: 'id1' } satisfies CreateData);
    });

    it('accepts checked create data (relation only)', () => {
        type CreateData = NonNullable<CreateArgs<Schema, 'Post'>['data']>;
        void ({ title: 'T', author: { connect: { id: 'id1' } } } satisfies CreateData);
    });

    // #endregion

    // #region XOR enforcement on UpdateArgs['data']

    it('rejects mixing FK + relation in update data', () => {
        type UpdateData = NonNullable<UpdateArgs<Schema, 'Post'>['data']>;
        // @ts-expect-error - cannot mix authorId (unchecked) and author (checked) in the same object
        const _mixed: UpdateData = { authorId: 'id1', author: { connect: { id: 'id1' } } };
    });

    it('accepts unchecked update data (FK only)', () => {
        type UpdateData = NonNullable<UpdateArgs<Schema, 'Post'>['data']>;
        void ({ authorId: 'id1' } satisfies UpdateData);
    });

    it('accepts checked update data (relation only)', () => {
        type UpdateData = NonNullable<UpdateArgs<Schema, 'Post'>['data']>;
        void ({ author: { connect: { id: 'id1' } } } satisfies UpdateData);
    });

    // #endregion

    // #region FK fields in updateMany

    it('accepts FK field in updateMany data', () => {
        type UpdateManyData = NonNullable<UpdateManyArgs<Schema, 'Post'>['data']>;
        void ({ authorId: 'id1' } satisfies UpdateManyData);
    });

    it('rejects relation object in updateMany data', () => {
        type UpdateManyData = NonNullable<UpdateManyArgs<Schema, 'Post'>['data']>;
        // @ts-expect-error - updateMany does not support relation objects
        void ({ author: { connect: { id: 'id1' } } } satisfies UpdateManyData);
    });

    // #endregion
});
