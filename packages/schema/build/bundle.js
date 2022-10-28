const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const fs = require('fs');

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
    })
    .then(() => {
        fs.cpSync('./src/res', 'bundle/res', { force: true, recursive: true });
        fs.cpSync('./asset', 'bundle/asset', {
            force: true,
            recursive: true,
        });
    })
    .then(() => console.log(success))
    .catch(() => process.exit(1));
