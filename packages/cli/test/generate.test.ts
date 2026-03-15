import { formatDocument } from '@zenstackhq/language';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, getDefaultPrelude, runCli } from './utils';

const model = `
model User {
    id String @id @default(cuid())
}
`;

describe('CLI generate command test', () => {
    it('should generate a TypeScript schema', async () => {
        const { workDir } = await createProject(model);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.prisma'))).toBe(false);
    });

    it('should respect custom output directory', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --output ./zen', workDir);
        expect(fs.existsSync(path.join(workDir, 'zen/schema.ts'))).toBe(true);
    });

    it('should respect custom schema location', async () => {
        const { workDir } = await createProject(model);
        fs.renameSync(path.join(workDir, 'zenstack/schema.zmodel'), path.join(workDir, 'zenstack/foo.zmodel'));
        runCli('generate --schema ./zenstack/foo.zmodel', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('should respect package.json config', async () => {
        const { workDir } = await createProject(model);
        fs.mkdirSync(path.join(workDir, 'foo'));
        fs.renameSync(path.join(workDir, 'zenstack/schema.zmodel'), path.join(workDir, 'foo/schema.zmodel'));
        fs.rmdirSync(path.join(workDir, 'zenstack'));
        const pkgJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        pkgJson.zenstack = {
            schema: './foo/schema.zmodel',
            output: './bar',
        };
        fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'bar/schema.ts'))).toBe(true);
    });

    it('should respect package.json schema dir config', async () => {
        const { workDir } = await createProject(model);
        fs.mkdirSync(path.join(workDir, 'foo'));
        fs.renameSync(path.join(workDir, 'zenstack/schema.zmodel'), path.join(workDir, 'foo/schema.zmodel'));
        fs.rmdirSync(path.join(workDir, 'zenstack'));
        const pkgJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        pkgJson.zenstack = {
            schema: './foo',
            output: './bar',
        };
        fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'bar/schema.ts'))).toBe(true);
    });

    it('should respect plugin lite options', async () => {
        const modelWithPlugin = `
plugin typescript {
    provider = "@core/typescript"
    lite = true
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithPlugin);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(true);
    });

    it('should respect plugin lite-only options', async () => {
        const modelWithPlugin = `
plugin typescript {
    provider = "@core/typescript"
    liteOnly = true
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithPlugin);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(false);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(true);
    });

    it('should respect lite option', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --lite', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(true);
    });

    it('should respect liteOnly option', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --lite-only', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(false);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(true);
    });

    it('should respect explicit liteOnly true option', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --lite-only=true', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(false);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(true);
    });

    it('should respect explicit liteOnly false option', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --lite-only=false', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(false);
    });

    it('should prefer CLI options over @core/typescript plugin settings for lite and liteOnly', async () => {
        const modelWithPlugin = `
plugin typescript {
    provider = "@core/typescript"
    lite = true
    liteOnly = true
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithPlugin);
        runCli('generate --lite=false --lite-only=false', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema-lite.ts'))).toBe(false);
    });

    it('should generate models.ts and input.ts by default', async () => {
        const { workDir } = await createProject(model);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(true);
    });

    it('should respect plugin options for generateModels and generateInput by default', async () => {
        const modelWithPlugin = `
plugin typescript {
    provider = "@core/typescript"
    generateModels = false
    generateInput = false
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithPlugin);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(false);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(false);
    });

    it('should generate models.ts when --generate-models=true is passed', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --generate-models=true', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(true);
    });

    it('should not generate models.ts when --generate-models=false is passed', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --generate-models=false', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(false);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(true);
    });

    it('should generate input.ts when --generate-input=true is passed', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --generate-input=true', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(true);
    });

    it('should not generate input.ts when --generate-input=false is passed', async () => {
        const { workDir } = await createProject(model);
        runCli('generate --generate-input=false', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(false);
    });

    it('should report error for unresolvable plugin module', async () => {
        const modelWithMissingPlugin = `
plugin foo {
    provider = '@zenstackhq/nonexistent-plugin'
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithMissingPlugin);
        expect(() => runCli('generate', workDir)).toThrow(/Cannot find plugin module/);
    });

    it('should succeed when plugin module exists but has no CLI generator', async () => {
        const modelWithNoGeneratorPlugin = `
plugin foo {
    provider = './my-plugin.mjs'
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithNoGeneratorPlugin);
        // Create a plugin module that doesn't export a default CLI generator
        fs.writeFileSync(path.join(workDir, 'zenstack/my-plugin.mjs'), 'export const name = "no-generator";');
        runCli('generate', workDir);
        // Should succeed without error, generating the default typescript output
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('should succeed when plugin only provides a plugin.zmodel for custom attributes', async () => {
        const modelWithZmodelOnlyPlugin = `
plugin myPlugin {
    provider = './my-plugin'
}

model User {
    id String @id @default(cuid())
    @@custom
}
`;
        const { workDir } = await createProject(modelWithZmodelOnlyPlugin);
        // Create a plugin directory with index.mjs (no default export) and a plugin.zmodel defining a custom attribute
        const pluginDir = path.join(workDir, 'zenstack/my-plugin');
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'index.mjs'), 'export const name = "my-plugin";');
        fs.writeFileSync(path.join(pluginDir, 'plugin.zmodel'), 'attribute @@custom()');
        runCli('generate', workDir);
        // Should succeed without error, generating the default typescript output
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('should succeed when plugin provider is a .zmodel file', async () => {
        const modelWithZmodelProvider = `
plugin myPlugin {
    provider = './custom-attrs/plugin.zmodel'
}

model User {
    id String @id @default(cuid())
    @@custom
}
`;
        const { workDir } = await createProject(modelWithZmodelProvider);
        const pluginDir = path.join(workDir, 'zenstack/custom-attrs');
        fs.mkdirSync(pluginDir, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'plugin.zmodel'), 'attribute @@custom()');
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('should load plugin from a bare package specifier via jiti', async () => {
        const modelWithBarePlugin = `
plugin foo {
    provider = 'my-test-plugin'
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithBarePlugin);
        // Create a fake node_modules package with a TS entry point
        // This can only be resolved by jiti, not by native import() or fs.existsSync checks
        const pkgDir = path.join(workDir, 'node_modules/my-test-plugin');
        fs.mkdirSync(pkgDir, { recursive: true });
        fs.writeFileSync(
            path.join(pkgDir, 'package.json'),
            JSON.stringify({ name: 'my-test-plugin', main: './index.ts' }),
        );
        fs.writeFileSync(
            path.join(pkgDir, 'index.ts'),
            `
const plugin = {
    name: 'test-bare-plugin',
    statusText: 'Testing bare plugin',
    async generate() {},
};
export default plugin;
`,
        );
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('should resolve plugin paths relative to the schema file where the plugin is declared', async () => {
        // Entry schema imports a sub-schema that declares a plugin with a relative path.
        // The plugin path should resolve relative to the sub-schema, not the entry schema.
        const { workDir } = await createProject(
            `import './core/core'

${getDefaultPrelude()}

model User {
    id String @id @default(cuid())
}
`,
            { customPrelude: true },
        );

        // Create core/ subdirectory with its own schema and plugin
        const coreDir = path.join(workDir, 'zenstack/core');
        fs.mkdirSync(coreDir, { recursive: true });

        const coreSchema = await formatDocument(`
plugin foo {
    provider = './my-core-plugin.ts'
}
`);
        fs.writeFileSync(path.join(coreDir, 'core.zmodel'), coreSchema);

        // Plugin lives next to the core schema, NOT next to the entry schema
        fs.writeFileSync(
            path.join(coreDir, 'my-core-plugin.ts'),
            `
const plugin = {
    name: 'core-plugin',
    statusText: 'Testing core plugin',
    async generate() {},
};
export default plugin;
`,
        );

        // This would fail if the plugin path was resolved relative to the entry schema
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('should prefer CLI options over @core/typescript plugin settings for generateModels and generateInput', async () => {
        const modelWithPlugin = `
plugin typescript {
    provider = "@core/typescript"
    generateModels = false
    generateInput = false
}

model User {
    id String @id @default(cuid())
}
`;
        const { workDir } = await createProject(modelWithPlugin);
        runCli('generate --generate-models --generate-input', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/models.ts'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/input.ts'))).toBe(true);
    });
});
