const { execSync } = require('child_process');

module.exports = function () {
    console.log('npm install');
    execSync('npm install', {
        encoding: 'utf-8',
        stdio: 'inherit',
        cwd: 'test-run',
    });
};
