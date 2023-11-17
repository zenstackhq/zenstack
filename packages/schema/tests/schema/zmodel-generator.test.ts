/// <reference types="@types/jest" />

import { ZModelCodeGenerator } from '@zenstackhq/sdk';
import fs from 'fs';
import path from 'path';
import { loadModel } from '../utils';

describe('ZModel Generator Tests', () => {
    it('run generator', async () => {
        const content = fs.readFileSync(path.join(__dirname, './all-features.zmodel'), 'utf-8');
        const model = await loadModel(content, true, false, false);
        const generator = new ZModelCodeGenerator();
        const generated = generator.generate(model);
        // fs.writeFileSync(path.join(__dirname, './all-features-baseline.zmodel'), generated, 'utf-8');
        await loadModel(generated);
    });
});
