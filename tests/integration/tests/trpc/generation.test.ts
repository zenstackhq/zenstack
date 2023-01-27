import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import { run } from '../../utils';

describe('tRPC Routers Generation Tests', () => {
    let origDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('basic', async () => {
        const testDir = path.join(__dirname, './test-run/basic');
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
        fse.copySync(path.join(__dirname, './test-project'), testDir);

        const nodePath = path.resolve(path.join(__dirname, '../../node_modules'));

        process.chdir(testDir);
        run('npm install');
        run('npx zenstack generate --schema ./todo.zmodel', { NODE_PATH: nodePath });
        run('npm run build', { NODE_PATH: nodePath });
    });
});
