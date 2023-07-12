import * as fs from 'fs';
import path from 'path';
import { loadModel } from '../utils';

describe('Trigger.dev Schema Tests', () => {
    it('model loading', async () => {
        const content = fs.readFileSync(path.join(__dirname, './trigger-dev.zmodel'), {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });
});
