import { loadDocument } from '@zenstackhq/language';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaFile = path.resolve(__dirname, '../zenstack/showcase.zmodel');
const outputDir = path.resolve(__dirname, '../preview-output');
const policyPlugin = path.resolve(__dirname, '../../policy/plugin.zmodel');

async function run() {
    const r = await loadDocument(schemaFile, fs.existsSync(policyPlugin) ? [policyPlugin] : []);
    if (!r.success) {
        console.error('Failed to load schema:', r.errors);
        process.exit(1);
    }
    await plugin.generate({
        schemaFile,
        model: r.model,
        defaultOutputPath: outputDir,
        pluginOptions: { output: outputDir, generateSkill: true },
    });
    console.log(`Preview output written to: ${outputDir}`);
    console.log('');
    function listFiles(dir: string, prefix = '') {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.isDirectory()) listFiles(path.join(dir, e.name), prefix + e.name + '/');
            else console.log('  ' + prefix + e.name);
        }
    }
    listFiles(outputDir);
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
