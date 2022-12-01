const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const fs = require('fs');
const envFilePlugin = require('./env-plugin');

require('esbuild')
    .build({
        entryPoints: [
            'src/extension.ts',
            'src/language-server/main.ts',
            'src/cli/index.ts',
        ],
        outdir: 'bundle',
        bundle: true,
        external: ['vscode'],
        platform: 'node',
        sourcemap: !minify,
        watch: watch
            ? {
                  onRebuild(error) {
                      if (error) console.error('Watch build failed');
                      else console.log(success);
                  },
              }
            : false,
        minify,
        plugins: [envFilePlugin],
    })
    .then(() => {
        fs.cpSync('./src/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('./asset', 'bundle/asset', {
            force: true,
            recursive: true,
        });

        require('dotenv').config();

        if (process.env.TELEMETRY_TRACKING_TOKEN) {
            let postInstallContent = fs.readFileSync(
                'script/post-install.js',
                'utf-8'
            );
            postInstallContent = postInstallContent.replace(
                '<TELEMETRY_TRACKING_TOKEN>',
                process.env.TELEMETRY_TRACKING_TOKEN
            );
            fs.writeFileSync('bin/post-install.js', postInstallContent, {
                encoding: 'utf-8',
            });
        } else {
            fs.writeFileSync('bin/post-install.js', '', {
                encoding: 'utf-8',
            });
        }
    })
    .then(() => console.log(success))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
