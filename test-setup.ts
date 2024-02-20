import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export default function globalSetup() {
    console.log('Setting up test project scaffold...');

    const scaffoldPath = path.join(__dirname, '.test/scaffold');
    if (fs.existsSync(scaffoldPath)) {
        fs.rmSync(scaffoldPath, { recursive: true, force: true });
    }
    fs.mkdirSync(scaffoldPath, { recursive: true });

    function run(cmd: string) {
        console.log(`Running: ${cmd}, in ${scaffoldPath}`);
        try {
            execSync(cmd, { cwd: scaffoldPath, stdio: 'ignore' });
        } catch (err) {
            console.error(`Test project scaffolding cmd error: ${err}`);
            throw err;
        }
    }

    run('npm init -y');
    run('npm i -D prisma typescript');
    run('npm i @prisma/client zod decimal.js');

    const localDeps = [
        'packages/schema/dist',
        'packages/runtime/dist',
        'packages/plugins/swr/dist',
        'packages/plugins/tanstack-query/dist',
        'packages/plugins/trpc/dist',
        'packages/plugins/openapi/dist',
    ];

    run(`npm i ${localDeps.map((d) => path.join('../../', d)).join(' ')}`);

    console.log('Test scaffold setup complete.');
}
