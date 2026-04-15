import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const token = process.env.TELEMETRY_TRACKING_TOKEN ?? '';

if (!token) {
    console.warn('TELEMETRY_TRACKING_TOKEN is not set.');
}

const filesToProcess = ['dist/index.mjs', 'dist/index.cjs'];
const _dirname = path.dirname(fileURLToPath(import.meta.url));

for (const file of filesToProcess) {
    console.log(`Processing ${file} for telemetry token...`);
    const filePath = path.join(_dirname, '..', file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const updatedContent = content.replace('<TELEMETRY_TRACKING_TOKEN>', token);
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
}
