require('dotenv').config({ path: './.env.local' });
require('dotenv').config({ path: './.env' });
const fs = require('fs');

if (process.env.TELEMETRY_TRACKING_TOKEN) {
    let postInstallContent = fs.readFileSync('bin/post-install.js', 'utf-8');
    postInstallContent = postInstallContent.replace('<TELEMETRY_TRACKING_TOKEN>', process.env.TELEMETRY_TRACKING_TOKEN);
    fs.writeFileSync('dist/bin/post-install.js', postInstallContent, {
        encoding: 'utf-8',
    });
} else {
    fs.writeFileSync('dist/bin/post-install.js', '', {
        encoding: 'utf-8',
    });
}

let cliContent = fs.readFileSync('dist/cli/index.js', 'utf-8');
if (process.env.DEFAULT_NPM_TAG) {
    cliContent = cliContent.replace('<DEFAULT_NPM_TAG>', process.env.DEFAULT_NPM_TAG);
} else {
    cliContent = cliContent.replace('<DEFAULT_NPM_TAG>', 'latest');
}
fs.writeFileSync('dist/cli/index.js', cliContent, {
    encoding: 'utf-8',
});
