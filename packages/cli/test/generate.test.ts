import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from './utils';

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
