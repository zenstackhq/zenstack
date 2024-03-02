import fs from 'fs';
import path from 'path';

export default function globalSetup() {
    if (!fs.existsSync(path.join(__dirname, '../.test/scaffold/package-lock.json'))) {
        console.error(`Test scaffold not found. Please run \`pnpm test-scaffold\` first.`);
        process.exit(1);
    }
}
