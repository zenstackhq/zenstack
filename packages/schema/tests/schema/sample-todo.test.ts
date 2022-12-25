import * as fs from 'fs';
import { loadModel } from '../utils';

describe('Basic Tests', () => {
    it('sample todo schema', async () => {
        const content = fs.readFileSync('../../samples/todo/schema.zmodel', {
            encoding: 'utf-8',
        });
        await loadModel(content);
    });
});
