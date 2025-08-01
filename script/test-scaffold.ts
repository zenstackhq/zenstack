import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const scaffoldPath = path.join(__dirname, '../.test/scaffold');
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
run('npm i --no-audit --no-fund typescript prisma@6.11.x @prisma/client@6.11.x zod@^3.22.4 decimal.js @types/node');

console.log('Test scaffold setup complete.');
