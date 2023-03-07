import { loadSchemaFromFile } from '@zenstackhq/testtools';
import path from 'path';

describe('Cal.com Sample Integration Tests', () => {
    it('model loading', async () => {
        await loadSchemaFromFile(path.join(__dirname, '../schema/cal-com.zmodel'), false, false);
    });
});
