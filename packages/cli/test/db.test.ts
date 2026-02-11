import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from './utils';

const model = `
model User {
    id String @id @default(cuid())
}
`;

describe('CLI db commands test', () => {
    it('should generate a database with db push', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('db push', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
    });

    it('should seed the database with db seed with seed script', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        const pkgJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        pkgJson.zenstack = {
            seed: 'node seed.js',
        };
        fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        fs.writeFileSync(
            path.join(workDir, 'seed.js'),
            `
import fs from 'node:fs';
fs.writeFileSync('seed.txt', 'success');
        `,
        );

        runCli('db seed', workDir);
        expect(fs.readFileSync(path.join(workDir, 'seed.txt'), 'utf8')).toBe('success');
    });

    it('should seed the database after migrate reset', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        const pkgJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        pkgJson.zenstack = {
            seed: 'node seed.js',
        };
        fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        fs.writeFileSync(
            path.join(workDir, 'seed.js'),
            `
import fs from 'node:fs';
fs.writeFileSync('seed.txt', 'success');
        `,
        );

        runCli('migrate reset --force', workDir);
        expect(fs.readFileSync(path.join(workDir, 'seed.txt'), 'utf8')).toBe('success');
    });

    it('should skip seeding the database without seed script', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('db seed', workDir);
    });
});
