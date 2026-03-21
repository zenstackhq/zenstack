import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config({ path: './.env.local' });
dotenv.config({ path: './.env' });

const telemetryToken = process.env.VSCODE_TELEMETRY_TRACKING_TOKEN;
if (!telemetryToken) {
    console.error('Error: VSCODE_TELEMETRY_TRACKING_TOKEN environment variable is not set');
    process.exit(1);
}
const file = 'dist/extension.js';
let content = fs.readFileSync(file, 'utf-8');
content = content.replace('<VSCODE_TELEMETRY_TRACKING_TOKEN>', telemetryToken);
fs.writeFileSync(file, content, 'utf-8');
console.log('Telemetry token injected into dist/extension.js');
