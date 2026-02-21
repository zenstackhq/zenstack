import { invariant } from '@zenstackhq/common-helpers';
import { loadDocument } from '@zenstackhq/language';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';

const DATASOURCE_PREAMBLE = `
datasource db {
    provider = 'sqlite'
    url      = 'file:./dev.db'
}
`;

const policyPluginZmodel = path.resolve(__dirname, '../../../plugins/policy/plugin.zmodel');
const pluginDocs = fs.existsSync(policyPluginZmodel) ? [policyPluginZmodel] : [];

export async function loadSchema(schema: string) {
    const fullSchema = DATASOURCE_PREAMBLE + schema;
    const tempFile = path.join(os.tmpdir(), `zenstack-schema-${crypto.randomUUID()}.zmodel`);
    fs.writeFileSync(tempFile, fullSchema);
    const r = await loadDocument(tempFile, pluginDocs);
    expect(r).toSatisfy(
        (r: typeof r) => r.success,
        `Failed to load schema: ${!r.success ? r.errors.map((e) => e.toString()).join(', ') : ''}`,
    );
    invariant(r.success);
    return r.model;
}

export async function loadSchemaFromFile(filePath: string) {
    const r = await loadDocument(filePath, pluginDocs);
    expect(r).toSatisfy(
        (r: typeof r) => r.success,
        `Failed to load schema from ${filePath}: ${!r.success ? r.errors.map((e) => e.toString()).join(', ') : ''}`,
    );
    invariant(r.success);
    return r.model;
}

/**
 * Extracts all relative markdown links from content and verifies
 * each target file exists relative to the source file's directory.
 * Returns an array of broken links with details.
 */
export function findBrokenLinks(
    outputDir: string,
): Array<{ source: string; link: string; target: string }> {
    const broken: Array<{ source: string; link: string; target: string }> = [];
    const mdFiles = collectMdFiles(outputDir);

    for (const mdFile of mdFiles) {
        const content = fs.readFileSync(mdFile, 'utf-8');
        const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;
        while ((match = linkPattern.exec(content)) !== null) {
            const href = match[2];
            if (href.startsWith('http') || href.startsWith('#')) continue;
            const resolved = path.resolve(path.dirname(mdFile), href);
            if (!fs.existsSync(resolved)) {
                broken.push({
                    source: path.relative(outputDir, mdFile),
                    link: href,
                    target: path.relative(outputDir, resolved),
                });
            }
        }
    }

    return broken;
}

function collectMdFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectMdFiles(full));
        } else if (entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}
