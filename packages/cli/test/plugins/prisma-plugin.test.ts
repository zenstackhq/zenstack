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

    it('should auto-generate opposite relation field with createOpposite: true', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model User {
    id String @id @default(cuid())
}

model Post {
    id       String @id @default(cuid())
    userId   String
    user     User   @relation(fields: [userId], references: [id], createOpposite: true)
}
`);
        runCli('generate', workDir);
        const prismaSchema = fs.readFileSync(path.join(workDir, 'zenstack/schema.prisma'), 'utf8');
        expect(prismaSchema).toContain('post Post[]');
        expect(prismaSchema).not.toContain('createOpposite');
    });

    it('should distinguish multiple relations to the same model by relation name', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model User {
    id String @id @default(cuid())
}

model Post {
    id          String @id @default(cuid())
    createdById String
    createdBy   User   @relation("CreatedBy", fields: [createdById], references: [id], createOpposite: true)
    updatedById String
    updatedBy   User   @relation("UpdatedBy", fields: [updatedById], references: [id], createOpposite: true)
}
`);
        runCli('generate', workDir);
        const prismaSchema = fs.readFileSync(path.join(workDir, 'zenstack/schema.prisma'), 'utf8');
        // Both opposite relations should be generated with disambiguated names
        expect(prismaSchema).toContain('createdBy Post[]');
        expect(prismaSchema).toContain('updatedBy Post[]');
        expect(prismaSchema).toContain('"CreatedBy"');
        expect(prismaSchema).toContain('"UpdatedBy"');
    });

    it('should error on field name collision with createOpposite', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model User {
    id   String @id @default(cuid())
    post String
}

model Post {
    id     String @id @default(cuid())
    userId String
    user   User   @relation(fields: [userId], references: [id], createOpposite: true)
}
`);
        expect(() => runCli('generate', workDir)).toThrow(/Cannot auto-generate opposite relation/);
    });

    it('should handle composite key models with createOpposite on scalar side', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model Tenant {
    orgId    String
    tenantId String
    name     String

    @@id([orgId, tenantId])
}

model Invoice {
    id             String @id @default(cuid())
    tenantOrgId    String
    tenantTenantId String
    tenant         Tenant @relation(fields: [tenantOrgId, tenantTenantId], references: [orgId, tenantId], createOpposite: true)
}
`);
        runCli('generate', workDir);
        const prismaSchema = fs.readFileSync(path.join(workDir, 'zenstack/schema.prisma'), 'utf8');
        expect(prismaSchema).toContain('invoice Invoice[]');
    });

    it('should handle createOpposite on array side using correct model id fields', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model User {
    uuid  String @id @default(cuid())
    posts Post[] @relation(createOpposite: true)
}

model Post {
    id String @id @default(cuid())
}
`);
        runCli('generate', workDir);
        const prismaSchema = fs.readFileSync(path.join(workDir, 'zenstack/schema.prisma'), 'utf8');
        // FK should reference User's uuid field, not Post's id
        expect(prismaSchema).toContain('userUuid String');
        expect(prismaSchema).toContain('user User');
        expect(prismaSchema).toContain('@relation(fields: [userUuid], references: [uuid])');
    });

    it('should error on missing opposite relation without createOpposite', async () => {
        const { workDir } = await createProject(`
plugin prisma {
    provider = '@core/prisma'
}

model User {
    id String @id @default(cuid())
}

model Post {
    id       String @id @default(cuid())
    userId   String
    user     User   @relation(fields: [userId], references: [id])
}
`);
        expect(() => runCli('generate', workDir)).toThrow(/missing an opposite relation/);
    });
});
