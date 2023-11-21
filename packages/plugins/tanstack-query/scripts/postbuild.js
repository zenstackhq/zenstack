// tsup doesn't replace npm dependency aliases in the dist files, so we have to do it manually

const replace = require('replace-in-file');

// tsup incorrectly resolve to legacy types, make a fix here
console.log('Replacing @tanstack/react-query-v5/build/legacy/types');
replace.sync({
    files: 'dist/runtime-v5/react*(.d.ts|.d.mts)',
    from: /@tanstack\/react-query-v5\/build\/legacy\/types/g,
    to: '@tanstack/react-query',
});

console.log('Replacing @tanstack/react-query-v5');
replace.sync({
    files: 'dist/runtime-v5/react*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/react-query-v5/g,
    to: '@tanstack/react-query',
});

console.log('Replacing @tanstack/svelte-query-v5');
replace.sync({
    files: 'dist/runtime-v5/svelte*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/svelte-query-v5/g,
    to: '@tanstack/svelte-query',
});

console.log('Replacing @tanstack/vue-query-v5');
replace.sync({
    files: 'dist/runtime-v5/vue*(.d.ts|.d.mts|.js|.mjs)',
    from: /@tanstack\/vue-query-v5/g,
    to: '@tanstack/vue-query',
});
