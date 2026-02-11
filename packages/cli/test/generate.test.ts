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
});
