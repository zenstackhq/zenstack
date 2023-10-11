import * as fs from 'fs';
import path from 'path';
import { loadModel } from '@zenstackhq/testtools';

describe('Cal.com Schema Tests', () => {
    it('model loading', async () => {
        const content = fs.readFileSync(path.join(__dirname, './cal-com.zmodel'), {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });
});
