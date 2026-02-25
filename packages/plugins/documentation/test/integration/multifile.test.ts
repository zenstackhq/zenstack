import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBrokenLinks, generateFromFile, readDoc } from '../utils';

const MULTIFILE_SCHEMA = path.resolve(__dirname, '../../zenstack/multifile/schema.zmodel');

describe('integration: multi-file schema', () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await generateFromFile(MULTIFILE_SCHEMA);
    });

    afterAll(() => {
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('artifacts show correct source file paths for declarations across files', () => {
        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).toContain('models.zmodel');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('**Defined in:**');
        expect(roleDoc).toContain('enums.zmodel');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('**Defined in:**');
        expect(tsDoc).toContain('mixins.zmodel');
    });

    it('has zero broken links across multi-file output', () => {
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });

    it('declaration code blocks show correct source for each file', () => {
        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<summary>Declaration');
        expect(userDoc).toContain('model User');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('<summary>Declaration');
        expect(roleDoc).toContain('enum Role');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('<summary>Declaration');
        expect(tsDoc).toContain('type Timestamps');
    });
});
