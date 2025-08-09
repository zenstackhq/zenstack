// tsup doesn't replace npm dependency aliases in the dist files, so we have to do it manually

const fs = require('fs');
const glob = require('glob');

function replaceSync({ file, from, to }) {
    const paths = glob.sync(file, { ignore: [], nodir: true });

    paths.forEach(path => {
        const contents = fs.readFileSync(path, { encoding: 'utf-8' });

        const newContents = contents.replace(from, to);

        if (newContents !== contents) {
            fs.writeFileSync(path, newContents, { encoding: 'utf-8' });
        }
    });
}

// tsup incorrectly resolve to legacy types, make a fix here
console.log('Replacing @tanstack/react-query-v5/build/legacy/types');
replaceSync({
    file: 'dist/runtime-v5/react*(.d.ts|.d.mts)',
    from: /@tanstack\/react-query-v5\/build\/legacy\/types/g,
    to: '@tanstack/react-query',
});

console.log('Replacing @tanstack/react-query-v5');
replaceSync({
    file: 'dist/runtime-v5/react*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/react-query-v5/g,
    to: '@tanstack/react-query',
});

console.log('Replacing @tanstack/svelte-query-v5');
replaceSync({
    file: 'dist/runtime-v5/svelte*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/svelte-query-v5/g,
    to: '@tanstack/svelte-query',
});

console.log('Replacing @tanstack/vue-query-v5');
replaceSync({
    file: 'dist/runtime-v5/vue*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/vue-query-v5/g,
    to: '@tanstack/vue-query',
});

console.log('Replacing @tanstack/angular-query-v5');
replaceSync({
    file: 'dist/runtime-v5/angular*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/angular-query-v5/g,
    to: '@tanstack/angular-query-experimental',
});
