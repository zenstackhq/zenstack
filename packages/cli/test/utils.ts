import { createTestProject, getTestDbProvider } from '@zenstackhq/testtools';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { formatDocument } from '@zenstackhq/language';

const TEST_PG_CONFIG = {
    host: process.env['TEST_PG_HOST'] ?? 'localhost',
    port: process.env['TEST_PG_PORT'] ? parseInt(process.env['TEST_PG_PORT']) : 5432,
    user: process.env['TEST_PG_USER'] ?? 'postgres',
    password: process.env['TEST_PG_PASSWORD'] ?? 'postgres',
};

const TEST_MYSQL_CONFIG = {
    host: process.env['TEST_MYSQL_HOST'] ?? 'localhost',
    port: process.env['TEST_MYSQL_PORT'] ? parseInt(process.env['TEST_MYSQL_PORT']) : 3306,
    user: process.env['TEST_MYSQL_USER'] ?? 'root',
    password: process.env['TEST_MYSQL_PASSWORD'] ?? 'mysql',
};

export function getTestDbName(provider: string) {
    if (provider === 'sqlite') {
        return './test.db';
    }
    const testName = expect.getState().currentTestName ?? 'unnamed';
    const testPath = expect.getState().testPath ?? '';
    // digest test name
    const digest = createHash('md5')
        .update(testName + testPath)
        .digest('hex');
    // compute a database name based on test name
    return (
        'test_' +
        testName
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 30) +
        digest.slice(0, 6)
    );
}

export function getTestDbUrl(provider: 'sqlite' | 'postgresql' | 'mysql', dbName: string): string {
    switch (provider) {
        case 'sqlite':
            return `file:${dbName}`;
        case 'postgresql':
            return `postgres://${TEST_PG_CONFIG.user}:${TEST_PG_CONFIG.password}@${TEST_PG_CONFIG.host}:${TEST_PG_CONFIG.port}/${dbName}`;
        case 'mysql':
            return `mysql://${TEST_MYSQL_CONFIG.user}:${TEST_MYSQL_CONFIG.password}@${TEST_MYSQL_CONFIG.host}:${TEST_MYSQL_CONFIG.port}/${dbName}`;
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}

export function getDefaultPrelude(options?: { provider?: 'sqlite' | 'postgresql' | 'mysql', datasourceFields?: Record<string, string | string[]> }) {
    const provider = (options?.provider || getTestDbProvider()) ?? 'sqlite';
    const dbName = getTestDbName(provider);
    let dbUrl: string;

    switch (provider) {
        case 'sqlite':
            dbUrl = `file:${dbName}`;
            break;
        case 'postgresql':
            dbUrl = `postgres://${TEST_PG_CONFIG.user}:${TEST_PG_CONFIG.password}@${TEST_PG_CONFIG.host}:${TEST_PG_CONFIG.port}/${dbName}`;
            break;
        case 'mysql':
            dbUrl = `mysql://${TEST_MYSQL_CONFIG.user}:${TEST_MYSQL_CONFIG.password}@${TEST_MYSQL_CONFIG.host}:${TEST_MYSQL_CONFIG.port}/${dbName}`;
            break;
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
    // Build fields array for proper alignment (matching ZModelCodeGenerator)
    const fields: [string, string][] = [
        ['provider', `'${provider}'`],
        ['url', `'${dbUrl}'`],
        ...Object.entries(options?.datasourceFields || {}).map(([k, v]) => {
            const value = Array.isArray(v) ? `[${v.map(item => `'${item}'`).join(', ')}]` : `'${v}'`;
            return [k, value] as [string, string];
        }),
    ];

    const formattedFields = fields.map(([name, value]) => {
        return `    ${name} = ${value}`;
    }).join('\n');

    const ZMODEL_PRELUDE = `datasource db {\n${formattedFields}\n}`;
    return ZMODEL_PRELUDE;
}

export async function createProject(
    zmodel: string,
    options?: { customPrelude?: boolean; provider?: 'sqlite' | 'postgresql' | 'mysql'; datasourceFields?: Record<string, string | string[]> },
) {
    const workDir = createTestProject();
    fs.mkdirSync(path.join(workDir, 'zenstack'), { recursive: true });
    const schemaPath = path.join(workDir, 'zenstack/schema.zmodel');
    const content = options?.customPrelude ? zmodel : `${getDefaultPrelude({ provider: options?.provider, datasourceFields: options?.datasourceFields })}\n\n${zmodel}`;
    const schema = await formatDocument(content);
    fs.writeFileSync(schemaPath, schema);
    return { workDir, schema };
}

export function runCli(command: string, cwd: string) {
    const cli = path.join(__dirname, '../dist/index.js');
    execSync(`node ${cli} ${command}`, { cwd });
}
