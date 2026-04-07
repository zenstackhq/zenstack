import { type ClientContract } from '@zenstackhq/orm';
import { describe, it } from 'vitest';
import { schema } from './orm/schemas/basic';

declare const db: ClientContract<typeof schema>;

describe('WhereInput unknown field type checks', () => {
    it('TypeScript should catch unknown fields in where clause', () => {
        // This should error if TypeScript properly catches unknown fields in where
        db.user.findMany({
            where: {
                email: 'test@example.com',
                notExistsColumn: 1, // IS this caught by TypeScript?
            },
        });
    });
});
