require('dotenv').config({ path: './.env.local' });
require('dotenv').config({ path: './.env' });
const fs = require('fs');

if (process.env.TELEMETRY_TRACKING_TOKEN) {
    let postInstallContent = fs.readFileSync('bin/post-install.js', 'utf-8');
    postInstallContent = postInstallContent.replace(
        '<TELEMETRY_TRACKING_TOKEN>',
        process.env.TELEMETRY_TRACKING_TOKEN
    );
    fs.writeFileSync('dist/bin/post-install.js', postInstallContent, {
        encoding: 'utf-8',
    });
} else {
    fs.writeFileSync('dist/bin/post-install.js', '', {
        encoding: 'utf-8',
    });
}
