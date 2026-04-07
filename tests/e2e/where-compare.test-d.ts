import { type ClientContract } from '@zenstackhq/orm';
import { describe, it } from 'vitest';
import { schema as delegateSchema } from './orm/schemas/delegate';
import { schema as basicSchema } from './orm/schemas/basic';

declare const delegateDb: ClientContract<typeof delegateSchema>;
declare const basicDb: ClientContract<typeof basicSchema>;

describe('Excess property check comparison', () => {
    it('basic model findMany - does NOT show error (regression)', () => {
        // If no TS error here, both basic and delegate models have the same bug
        basicDb.user.findMany({
            where: {
                email: 'test@test.com',
                notExistsOnBasicModel: 1,
            },
        });
    });

    it('delegate base model findMany - does NOT show error (bug being reported)', () => {
        delegateDb.asset.findMany({
            where: {
                viewCount: 1,
                notExistsOnDelegateModel: 1,
            },
        });
    });

    it('delegate sub model findMany', () => {
        delegateDb.video.findMany({
            where: {
                duration: 1,
                notExistsOnSubModel: 1,
            },
        });
    });
});
