const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const fs = require('fs');
require('dotenv').config({ path: './.env.local' });
require('dotenv').config({ path: './.env' });

// Replace telemetry token in generated bundle files after building
function replaceTelemetryTokenInBundle() {
    const telemetryToken = process.env.VSCODE_TELEMETRY_TRACKING_TOKEN;
    if (!telemetryToken) {
        console.error('Error: VSCODE_TELEMETRY_TRACKING_TOKEN environment variable is not set');
        process.exit(1);
    }
    const file = 'bundle/extension.js';
    let content = fs.readFileSync(file, 'utf-8');
    content = content.replace('<VSCODE_TELEMETRY_TRACKING_TOKEN>', telemetryToken);
    fs.writeFileSync(file, content, 'utf-8');
}

require('esbuild')
    .build({
        entryPoints: ['src/extension.ts', 'src/language-server/main.ts'],
        outdir: 'bundle',
        bundle: true,
        external: ['vscode', '@prisma/*'],
        platform: 'node',
        sourcemap: !minify,
        minify,
    })
    .then(() => {
        // Replace the token after building outputs
        replaceTelemetryTokenInBundle();
    })
    .then(() => {
        fs.cpSync('./src/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('./src/vscode/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('../language/syntaxes', 'bundle/syntaxes', { force: true, recursive: true });
    })
    .then(() => console.log(success))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
