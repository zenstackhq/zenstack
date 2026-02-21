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
