import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from './utils';

const validModel = `
model User {
    id String @id @default(cuid())
    email String @unique
    name String?
    posts Post[]
}

model Post {
    id String @id @default(cuid())
    title String
    content String?
    author User @relation(fields: [authorId], references: [id])
    authorId String
}
`;

const invalidModel = `
model User {
    id String @id @default(cuid())
    email String @unique
    posts Post[]
}

model Post {
    id String @id @default(cuid())
    title String
    author User @relation(fields: [authorId], references: [id])
    // Missing authorId field - should cause validation error
}
`;

describe('CLI validate command test', () => {
    it('should validate a valid schema successfully', async () => {
        const { workDir } = await createProject(validModel);

        // Should not throw an error
        expect(() => runCli('check', workDir)).not.toThrow();
    });

    it('should fail validation for invalid schema', async () => {
        const { workDir } = await createProject(invalidModel);

        // Should throw an error due to validation failure
        expect(() => runCli('check', workDir)).toThrow();
    });

    it('should respect custom schema location', async () => {
        const { workDir } = await createProject(validModel);
        fs.renameSync(path.join(workDir, 'zenstack/schema.zmodel'), path.join(workDir, 'zenstack/custom.zmodel'));

        // Should not throw an error when using custom schema path
        expect(() => runCli('check --schema ./zenstack/custom.zmodel', workDir)).not.toThrow();
    });

    it('should fail when schema file does not exist', async () => {
        const { workDir } = await createProject(validModel);

        // Should throw an error when schema file doesn't exist
        expect(() => runCli('check --schema ./nonexistent.zmodel', workDir)).toThrow();
    });

    it('should respect package.json config', async () => {
        const { workDir } = await createProject(validModel);
        fs.mkdirSync(path.join(workDir, 'foo'));
        fs.renameSync(path.join(workDir, 'zenstack/schema.zmodel'), path.join(workDir, 'foo/schema.zmodel'));
        fs.rmdirSync(path.join(workDir, 'zenstack'));

        const pkgJson = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
        pkgJson.zenstack = {
            schema: './foo/schema.zmodel',
        };
        fs.writeFileSync(path.join(workDir, 'package.json'), JSON.stringify(pkgJson, null, 2));

        // Should not throw an error when using package.json config
        expect(() => runCli('check', workDir)).not.toThrow();
    });

    it('should validate schema with syntax errors', async () => {
        const modelWithSyntaxError = `
model User {
    id String @id @default(cuid())
    email String @unique
    // Missing closing brace - syntax error
        `;
        const { workDir } = await createProject(modelWithSyntaxError);

        // Should throw an error due to syntax error
        expect(() => runCli('check', workDir)).toThrow();
    });
});
