import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from './utils';

const model = `
model User {
    id String @id @default(cuid())
}
`;

const MIGRATION_ARTIFACTS = ['snapshot.json', 'migration.ts'];

describe('CLI migrate/db push with --native (native engine)', () => {
    it('migrate dev --native creates a migration and the database', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --native --name init', workDir);

        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
        const migrations = fs
            .readdirSync(path.join(workDir, 'zenstack/migrations'))
            .filter((f) => f.endsWith('_init'));
        expect(migrations).toHaveLength(1);
        const dir = path.join(workDir, 'zenstack/migrations', migrations[0]!);
        for (const artifact of MIGRATION_ARTIFACTS) {
            expect(fs.existsSync(path.join(dir, artifact))).toBe(true);
        }
    });

    it('migrate dev --native --create-only does not apply', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --native --name init --create-only', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/migrations'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(false);
    });

    it('migrate deploy --native applies pending migrations', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --native --name init', workDir);
        fs.rmSync(path.join(workDir, 'zenstack/test.db'));
        runCli('migrate deploy --native', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
    });

    it('migrate reset --native re-applies migrations', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --native --name init', workDir);
        runCli('migrate reset --native --force', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
    });

    it('supports migrate status --native', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --native --name init', workDir);
        runCli('migrate status --native', workDir);
    });

    it('db push --native syncs the database without migration files', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('db push --native', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
        // db push does not create a migration history
        expect(fs.existsSync(path.join(workDir, 'zenstack/migrations'))).toBe(false);
    });

    it('migrate baseline --native adopts an existing database', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        // simulate a database already built (e.g. by Prisma): tables exist, no migration history
        runCli('db push --native', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/migrations'))).toBe(false);

        // baseline records the current state as applied without recreating anything
        runCli('migrate baseline --native --name init', workDir);
        const migrations = fs
            .readdirSync(path.join(workDir, 'zenstack/migrations'))
            .filter((f) => f.endsWith('_init'));
        expect(migrations).toHaveLength(1);

        // deploy is a no-op — it must not try to recreate the existing tables
        expect(() => runCli('migrate deploy --native', workDir)).not.toThrow();
    });

    it('migrate resolve --native requires --applied', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        expect(() => runCli('migrate resolve --native --rolled-back foo', workDir)).toThrow();
    });

    it('activates the native engine via ZENSTACK_NATIVE_MIGRATE env var (no --native flag)', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        runCli('migrate dev --name init', workDir, { ZENSTACK_NATIVE_MIGRATE: '1' });

        // native engine ran: a migration folder with the native `snapshot.json` artifact exists
        const migrations = fs
            .readdirSync(path.join(workDir, 'zenstack/migrations'))
            .filter((f) => f.endsWith('_init'));
        expect(migrations).toHaveLength(1);
        expect(fs.existsSync(path.join(workDir, 'zenstack/migrations', migrations[0]!, 'snapshot.json'))).toBe(true);
        expect(fs.existsSync(path.join(workDir, 'zenstack/test.db'))).toBe(true);
    });
});
