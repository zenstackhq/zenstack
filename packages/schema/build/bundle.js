const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const fs = require('fs');

require('esbuild')
    .build({
        entryPoints: ['src/extension.ts', 'src/language-server/main.ts'],
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
    })
    .then(() => {
        fs.cpSync('./src/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('./asset', 'bundle/asset', {
            force: true,
            recursive: true,
        });
        fs.cpSync('../../README.md', 'bundle/README.md', {
            force: true,
        });
        fs.cpSync('../../LICENSE', 'bundle/LICENSE', {
            force: true,
        });
        fs.cpSync('./package.json', 'bundle/package.json', {
            force: true,
        });
    })
    .then(() => console.log(success))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
