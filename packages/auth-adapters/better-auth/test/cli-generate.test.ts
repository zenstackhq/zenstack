import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import tmp from 'tmp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, '..');

/**
 * Helper function to generate schema using better-auth CLI
 */
function generateSchema(configFile: string): string {
    const { name: workDir } = tmp.dirSync({ unsafeCleanup: true });
    const schemaPath = path.join(workDir, 'schema.zmodel');
    const configPath = path.join(__dirname, configFile);

    execSync(`pnpm better-auth generate --config ${configPath} --output ${schemaPath} --yes`, {
        cwd: packageRoot,
        stdio: 'pipe',
    });

    return schemaPath;
}

/**
 * Helper function to verify schema with zenstack check
 */
function verifySchema(schemaPath: string) {
    const cliPath = path.join(__dirname, '../../../cli/dist/index.mjs');
    const workDir = path.dirname(schemaPath);

    expect(fs.existsSync(schemaPath)).toBe(true);

    expect(() => {
        execSync(`node ${cliPath} check --schema ${schemaPath}`, {
            cwd: workDir,
            stdio: 'pipe',
        });
    }).not.toThrow();
}

describe('Cli schema generation tests', () => {
    it('works with simple config', async () => {
        const schemaPath = generateSchema('auth.ts');
        verifySchema(schemaPath);
    });

    it('works with custom config', async () => {
        const schemaPath = generateSchema('auth-custom.ts');
        verifySchema(schemaPath);

        // Verify that the generated schema contains the expected default values
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        expect(schemaContent).toMatch(/role\s+String/);
        expect(schemaContent).toContain("@default('user')");
        expect(schemaContent).toMatch(/lang\s+String/);
        expect(schemaContent).toContain("@default('en')");
        expect(schemaContent).toMatch(/age\s+Int/);
        expect(schemaContent).toContain('@default(18)');
        expect(schemaContent).toMatch(/admin\s+Boolean/);
        expect(schemaContent).toContain('@default(false)');
    });
});
