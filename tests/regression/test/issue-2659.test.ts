import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2659
describe('Regression for issue 2659', () => {
    it('testtools declares every package it imports at runtime', () => {
        const pkgDir = path.resolve(__dirname, '../../../packages/testtools');
        const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));
        const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]);

        const srcDir = path.join(pkgDir, 'src');
        const imported = new Set<string>();
        for (const file of fs.readdirSync(srcDir)) {
            if (!file.endsWith('.ts') || file.endsWith('.d.ts')) {
                continue;
            }
            const content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
            for (const m of content.matchAll(/^import\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
                const spec = m[1]!;
                if (spec.startsWith('.') || spec.startsWith('node:') || builtinModules.includes(spec)) {
                    continue;
                }
                const parts = spec.split('/');
                imported.add(spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!);
            }
        }

        const missing = [...imported].filter((name) => !declared.has(name));
        expect(missing).toEqual([]);
    });
});
