import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from './utils';

const model = `
model User {
    id String @id @default(cuid())
}
`;

describe('CLI migrate commands test', () => {
    it('should generate a database with migrate dev', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --name init', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/migrations'))).toBe(true);
    });

    it('should reset the database with migrate reset', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('db push', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
        runCli('migrate reset --force', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
    });

    it('should reset the database with migrate deploy', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --name init', workDir);
        fs.rmSync(path.join(workDir, 'zenstack/test.db'));
        runCli('migrate deploy', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
    });

    it('supports migrate status', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --name init', workDir);
        runCli('migrate status', workDir);
    });

    it('supports migrate resolve', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --name init', workDir);

        // find the migration record "timestamp_init"
        const migrationRecords = fs.readdirSync(path.join(workDir, 'zenstack/migrations'));
        const migration = migrationRecords.find((f) => f.endsWith('_init'));

        // force a migration failure
        fs.writeFileSync(path.join(workDir, 'zenstack/migrations', migration!, 'migration.sql'), 'invalid content');

        // redeploy the migration, which will fail
        fs.rmSync(path.join(workDir, 'zenstack/test.db'), { force: true });
        try {
            runCli('migrate deploy', workDir);
        } catch {
            // noop
        }

        // --rolled-back
        runCli(`migrate resolve --rolled-back ${migration}`, workDir);

        // --applied
        runCli(`migrate resolve --applied ${migration}`, workDir);
    });

    it('should throw error when neither applied nor rolled-back is provided', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        expect(() => runCli('migrate resolve', workDir)).toThrow();
    });
});
