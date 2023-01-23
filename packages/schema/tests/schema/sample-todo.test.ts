import * as fs from 'fs';
import path from 'path';
import { loadModel } from '../utils';

describe('Basic Tests', () => {
    it('sample todo schema', async () => {
        const content = fs.readFileSync(path.join(__dirname, './todo.zmodel'), {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });
});
