import { createConfig } from '@zenstackhq/tsdown-config';

// `index` and `schema-generator` are built as two separate tsdown invocations so that
// the lazy `await import('@zenstackhq/better-auth/schema-generator')` in the adapter
// stays lazy in the CJS output. When both entries live in a single build, Rolldown
// treats them as siblings and injects a top-level `require('./schema-generator.cjs')`
// into `index.cjs`, which eagerly pulls in `@zenstackhq/language` (Langium) at adapter
// load time. Splitting the builds hides that relationship; `neverBundle` then keeps
// the dynamic import as a package-name reference that Node resolves at first call.
export default [
    createConfig({
        entry: { index: 'src/index.ts' },
        deps: { neverBundle: ['@zenstackhq/better-auth/schema-generator'] },
    }),
    createConfig({
        entry: { 'schema-generator': 'src/schema-generator.ts' },
    }),
];
