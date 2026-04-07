import { type FindManyArgs, type WhereInput, type SelectSubset, type SimplifiedPlainResult } from '@zenstackhq/orm';
import { describe, it } from 'vitest';
import { schema as basicSchema } from './orm/schemas/basic';
import { schema as delegateSchema } from './orm/schemas/delegate';

// Basic schema test
type BasicSchema = typeof basicSchema;
declare function findManyBasic<T extends Omit<FindManyArgs<BasicSchema, 'User'>, 'where'>>(
    args?: { where?: WhereInput<BasicSchema, 'User'> } 
         & SelectSubset<T, Omit<FindManyArgs<BasicSchema, 'User'>, 'where'>>
): SimplifiedPlainResult<BasicSchema, 'User', T>[];

// Delegate schema test (Asset is a delegate/polymorphic base model)
type DelegateSchema = typeof delegateSchema;
declare function findManyAsset<T extends Omit<FindManyArgs<DelegateSchema, 'Asset'>, 'where'>>(
    args?: { where?: WhereInput<DelegateSchema, 'Asset'> } 
         & SelectSubset<T, Omit<FindManyArgs<DelegateSchema, 'Asset'>, 'where'>>
): SimplifiedPlainResult<DelegateSchema, 'Asset', T>[];

describe('Both basic and delegate models catch unknown where fields', () => {
    it('basic model - notExistsColumn caught', () => {
        // @ts-expect-error notExistsColumn should be caught
        findManyBasic({
            where: { email: 'test@test.com', notExistsColumn: 1 },
        });
    });

    it('delegate base model - notExistsColumn caught', () => {
        // @ts-expect-error notExistsColumn should be caught (THE REPORTED BUG)
        findManyAsset({
            where: { viewCount: 1, notExistsColumn: 1 },
        });
    });
});
