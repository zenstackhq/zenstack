import { loadDocument } from '@zenstackhq/language';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import plugin from '../src/index';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const policyPlugin = path.resolve(__dirname, '../../policy/plugin.zmodel');
const extraPlugins = fs.existsSync(policyPlugin) ? [policyPlugin] : [];

interface PreviewTarget {
    name: string;
    schemaFile: string;
    outputDir: string;
}

const targets: PreviewTarget[] = [
    {
        name: 'showcase',
        schemaFile: path.resolve(__dirname, '../zenstack/showcase.zmodel'),
        outputDir: path.resolve(__dirname, '../preview-output/showcase'),
    },
    {
        name: 'verbose',
        schemaFile: path.resolve(__dirname, '../zenstack/verbose/schema.zmodel'),
        outputDir: path.resolve(__dirname, '../preview-output/verbose'),
    },
];

function listFiles(dir: string, prefix = '', seen = new Set<string>()) {
    const realDir = fs.realpathSync(dir);
    if (seen.has(realDir)) return;
    seen.add(realDir);
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) listFiles(path.join(dir, e.name), prefix + e.name + '/', seen);
        else console.log('  ' + prefix + e.name);
    }
}

async function generateTarget(target: PreviewTarget) {
    console.log(`\n── ${target.name} ──────────────────────────────`);
    const r = await loadDocument(target.schemaFile, extraPlugins);
    if (!r.success) {
        console.error(`Failed to load ${target.name} schema:`, r.errors);
        process.exit(1);
    }
    await plugin.generate({
        schemaFile: target.schemaFile,
        model: r.model,
        defaultOutputPath: target.outputDir,
        pluginOptions: { output: target.outputDir, generateSkill: true, generateErd: true, diagramFormat: 'svg' },
    });
    console.log(`Output: ${target.outputDir}`);
    listFiles(target.outputDir);
}

async function run() {
    for (const target of targets) {
        await generateTarget(target);
    }
    console.log('\nDone.');
}

run().catch((e) => {
    console.error(e);
    process.exit(1);
});
