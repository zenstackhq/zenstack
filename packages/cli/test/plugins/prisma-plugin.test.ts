import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from '../utils';

describe('Core plugins tests', () => {
    it('can automatically generate a TypeScript schema with default output', async () => {
        const { workDir } = await createProject(`
model User {
    id String @id @default(cuid())
}
`);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.ts'))).toBe(true);
    });

    it('can automatically generate a TypeScript schema with custom output', async () => {
        const { workDir } = await createProject(`
plugin typescript {
    provider = '@core/typescript'
    output = '../generated-schema'
}

model User {
    id String @id @default(cuid())
}
`);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'generated-schema/schema.ts'))).toBe(true);
    });

    it('can generate a Prisma schema with default output', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model User {
    id String @id @default(cuid())
}
`);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'zenstack/schema.prisma'))).toBe(true);
    });

    it('can generate a Prisma schema with custom output', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
    output = '../prisma/schema.prisma'
}

model User {
    id String @id @default(cuid())
}
`);
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'prisma/schema.prisma'))).toBe(true);
    });

    it('can generate a Prisma schema with custom output relative to zenstack.output', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
    output = './schema.prisma'
}

model User {
    id String @id @default(cuid())
}
`);

        const pkgJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        pkgJson.zenstack = {
            output: './relative',
        };
        fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(pkgJson, null, 2));
        runCli('generate', workDir);
        expect(fs.existsSync(path.join(workDir, 'relative/schema.prisma'))).toBe(true);
    });
});
