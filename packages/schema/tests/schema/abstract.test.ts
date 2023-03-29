import * as fs from 'fs';
import path from 'path';
import { loadModel } from '../utils';

describe('Abstract Schema Tests', () => {
    it('model loading', async () => {
        const content = fs.readFileSync(path.join(__dirname, './abstract.zmodel'), {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });
});
