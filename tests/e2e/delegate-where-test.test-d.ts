import { type ClientContract, type WhereInput } from '@zenstackhq/orm';
import { describe, it } from 'vitest';

// Two separate test variables for different schemas
import { schema as delegateSchema } from './orm/schemas/delegate';
import { schema as basicSchema } from './orm/schemas/basic';

declare const delegateDb: ClientContract<typeof delegateSchema>;
declare const basicDb: ClientContract<typeof basicSchema>;

describe('WhereInput excess property checking - delegate vs basic', () => {
    it('test 1: direct WhereInput type assignment on delegate model', () => {
        // @ts-expect-error notExistsColumn should not be valid  
        const w: WhereInput<typeof delegateSchema, 'Asset'> = {
            viewCount: 1,
            notExistsColumn: 1,
        };
        void w;
    });

    it('test 2: basic user model via findMany', () => {
        // Does TypeScript catch this?
        basicDb.user.findMany({
            where: {
                email: 'test@test.com',
                notExistsColumn: 1,
            },
        });
    });

    it('test 3: delegate Asset base model via findMany', () => {
        // Does TypeScript catch this?  
        delegateDb.asset.findMany({
            where: {
                viewCount: 1,
                notExistsColumn: 1,
            },
        });
    });
});
