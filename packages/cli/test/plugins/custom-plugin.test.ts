import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from '../utils';
import { execSync } from 'node:child_process';

describe('Custom plugins tests', () => {
    it('runs custom plugin generator', async () => {
        const { workDir } = await createProject(`
plugin custom {
    provider = '../my-plugin.js'
    output = '../custom-output'
}

model User {
    id String @id @default(cuid())
}
`);

        fs.writeFileSync(
            path.join(workDir, 'my-plugin.ts'),
            `
import type { CliPlugin } from '@zenstackhq/sdk';
import fs from 'node:fs';
import path from 'node:path';

const plugin: CliPlugin = {
    name: 'Custom Generator',
    statusText: 'Generating foo.txt',
    async generate({ model, defaultOutputPath, pluginOptions }) {
        let outDir = defaultOutputPath;
        if (typeof pluginOptions['output'] === 'string') {
            outDir = path.resolve(defaultOutputPath, pluginOptions['output']);
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
        }
        fs.writeFileSync(path.join(outDir, 'foo.txt'), 'from my plugin');
    },
};

export default plugin;
`,
        );

        execSync('npx tsc', { cwd: workDir });
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'custom-output/foo.txt'))).toBe(true);
    });
});
