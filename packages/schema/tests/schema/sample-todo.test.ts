import * as fs from 'fs';
import path from 'path';
import { loadModel } from '@zenstackhq/testtools';

describe('Sample Todo Schema Tests', () => {
    it('model loading', async () => {
        const content = fs.readFileSync(path.join(__dirname, './todo.zmodel'), {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });
});
