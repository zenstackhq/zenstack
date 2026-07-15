import Database from 'better-sqlite3';
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

    describe('data-loss warnings', () => {
        // v1 has a droppable column; removing `name` from the schema is a destructive change
        const modelWithName = `
model User {
    id String @id @default(cuid())
    name String
}
`;

        /** Rewrites the project schema, dropping the `name` field (a destructive change). */
        function dropNameField(workDir: string) {
            const schemaPath = path.join(workDir, 'zenstack/schema.zmodel');
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            const updated = schema.replace(/^\s*name\s+String\s*$/m, '');
            expect(updated).not.toEqual(schema); // the field was actually removed
            fs.writeFileSync(schemaPath, updated);
        }

        function seedUser(workDir: string) {
            const db = new Database(path.join(workDir, 'zenstack/test.db'));
            try {
                db.prepare('INSERT INTO "User" ("id", "name") VALUES (?, ?)').run('u1', 'Alice');
            } finally {
                db.close();
            }
        }

        function userColumns(workDir: string): string[] {
            const db = new Database(path.join(workDir, 'zenstack/test.db'));
            try {
                return db
                    .prepare('PRAGMA table_info("User")')
                    .all()
                    .map((r: any) => r.name);
            } finally {
                db.close();
            }
        }

        function migrationFolders(workDir: string): string[] {
            return fs.readdirSync(path.join(workDir, 'zenstack/migrations')).sort();
        }

        it('migrate dev --native aborts on destructive changes in non-interactive mode', async () => {
            const { workDir } = await createProject(modelWithName, { provider: 'sqlite' });
            runCli('migrate dev --native --name init', workDir);
            seedUser(workDir); // the at-risk column holds data

            dropNameField(workDir);
            // the test runner's spawned CLI has no TTY, so confirmation is impossible → abort
            expect(() => runCli('migrate dev --native --name drop', workDir)).toThrow();

            // nothing was written or applied
            expect(migrationFolders(workDir)).toHaveLength(1);
            expect(userColumns(workDir)).toContain('name');
        });

        it('migrate dev --native --create-only generates despite destructive changes', async () => {
            const { workDir } = await createProject(modelWithName, { provider: 'sqlite' });
            runCli('migrate dev --native --name init', workDir);
            seedUser(workDir);

            dropNameField(workDir);
            // create-only applies nothing, so no confirmation is needed — warnings are just printed
            runCli('migrate dev --native --name drop --create-only', workDir);

            const folders = migrationFolders(workDir);
            expect(folders).toHaveLength(2);
            expect(folders.some((f) => f.endsWith('_drop'))).toBe(true);
            // the migration was authored but not applied — the column (and its data) survive
            expect(userColumns(workDir)).toContain('name');
        });

        it('migrate dev --native proceeds when dropped data is absent', async () => {
            const { workDir } = await createProject(modelWithName, { provider: 'sqlite' });
            runCli('migrate dev --native --name init', workDir);
            // no rows seeded — the data-aware check proves nothing is at risk

            dropNameField(workDir);
            expect(() => runCli('migrate dev --native --name drop', workDir)).not.toThrow();

            const folders = migrationFolders(workDir);
            expect(folders).toHaveLength(2);
            expect(folders.some((f) => f.endsWith('_drop'))).toBe(true);
            // the migration was applied
            expect(userColumns(workDir)).not.toContain('name');
        });
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
