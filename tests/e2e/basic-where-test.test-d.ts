import { type ClientContract } from '@zenstackhq/orm';
import { describe, it } from 'vitest';
import { schema } from './orm/schemas/basic';

declare const db: ClientContract<typeof schema>;

describe('Basic model WhereInput excess property check', () => {
    it('should error when unknown field is in where clause on basic model', () => {
        // Does TypeScript CATCH this error?
        db.user.findMany({
            where: {
                email: 'test@test.com',
                notExistsColumn: 1,  // IS this caught?
            },
        });
    });
});
