import { type ClientContract } from '@zenstackhq/orm';
import { describe, it } from 'vitest';
import { schema } from './orm/schemas/basic';

declare const db: ClientContract<typeof schema>;

describe('Definitive EPC test - NO @ts-expect-error', () => {
    it('basic model findMany where - direct call without suppression', () => {
        // Does TS2353 appear on the notExistsColumn line?
        db.user.findMany({
            where: {
                email: 'test@example.com',
                notExistsColumn: 1,  // <<< Does TS catch this?
            },
        });
    });
});
