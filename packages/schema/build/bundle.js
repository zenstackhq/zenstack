const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const fs = require('fs');
const path = require('path');

// Replace telemetry token before building
function replaceTelemetryToken() {
    const telemetryToken = process.env.TELEMETRY_TRACKING_TOKEN;
    if (!telemetryToken) {
        console.error('Error: TELEMETRY_TRACKING_TOKEN environment variable is not set');
        process.exit(1);
    }

    const constantsPath = path.join(__dirname, '../src/constants.ts');
    let constantsContent = fs.readFileSync(constantsPath, 'utf8');

    // Replace the placeholder with the actual token
    constantsContent = constantsContent.replace('<TELEMETRY_TRACKING_TOKEN>', telemetryToken);

    fs.writeFileSync(constantsPath, constantsContent);
    console.log('Telemetry token replaced successfully');
}

// Replace the token before building
replaceTelemetryToken();

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
        fs.cpSync('./src/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('./src/vscode/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('../language/syntaxes', 'bundle/syntaxes', { force: true, recursive: true });
    })
    .then(() => console.log(success))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
