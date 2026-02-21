/**
 * Quick preview script — generates docs from a schema and opens the output.
 *
 * Usage:
 *   npx tsx scripts/preview.ts [schema-path] [output-dir]
 *
 * Defaults:
 *   schema-path: zenstack/showcase.zmodel (the plugin's built-in showcase schema)
 *   output-dir:  ./preview-output
 */

import { loadDocument } from '@zenstackhq/language';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin from '../src/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const policyPluginZmodel = path.resolve(__dirname, '../../plugins/policy/plugin.zmodel');
const pluginDocs = fs.existsSync(policyPluginZmodel) ? [policyPluginZmodel] : [];

async function main() {
    const schemaPath = path.resolve(process.argv[2] ?? path.join(__dirname, '../zenstack/showcase.zmodel'));
    const outputDir = path.resolve(process.argv[3] ?? path.join(__dirname, '../preview-output'));

    console.log(`Schema:  ${schemaPath}`);
    console.log(`Output:  ${outputDir}`);
    console.log();

    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true });
    }

    const result = await loadDocument(schemaPath, pluginDocs);
    if (!result.success) {
        console.error('Failed to load schema:');
        for (const err of result.errors) {
            console.error(`  ${err}`);
        }
        process.exit(1);
    }

    await plugin.generate({
        schemaFile: schemaPath,
        model: result.model,
        defaultOutputPath: outputDir,
        pluginOptions: { output: outputDir },
    });

    const files = collectFiles(outputDir);
    console.log(`Generated ${files.length} files:\n`);
    for (const f of files) {
        console.log(`  ${path.relative(outputDir, f)}`);
    }
    console.log(`\nDone. Inspect output at: ${outputDir}`);
}

function collectFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectFiles(full));
        } else {
            results.push(full);
        }
    }
    return results.sort();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
