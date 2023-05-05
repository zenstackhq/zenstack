import path from 'path';
import { loadDocument } from '../../../src/cli/cli-util';

describe('Mutiple files Tests', () => {
    it('model loading post', async () => {
        await loadDocument(path.join(__dirname, './schema.zmodel'));
    });

    it('model loading user', async () => {
        await loadDocument(path.join(__dirname, './user.zmodel'));
    });
});
