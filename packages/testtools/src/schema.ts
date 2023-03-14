/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { withOmit, withPassword, withPolicy, withPresets, type AuthUser, type DbOperations } from '@zenstackhq/runtime';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import tmp from 'tmp';

export type WeakDbOperations = {
    [key in keyof DbOperations]: (...args: any[]) => Promise<any>;
};

export type WeakDbClientContract = Record<string, WeakDbOperations> & {
    $on(eventType: any, callback: (event: any) => void): void;
    $use(cb: any): void;
    $disconnect: () => Promise<void>;
    $transaction: (input: ((tx: WeakDbClientContract) => Promise<any>) | any[], options?: any) => Promise<any>;
    $queryRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<any>;
    $executeRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<number>;
    $extends: (args: any) => WeakDbClientContract;
};

export function run(cmd: string, env?: Record<string, string>, cwd?: string) {
    execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, DO_NOT_TRACK: '1', ...env },
        cwd,
    });
}

export function getWorkspaceRoot(start: string) {
    let curr = start;
    while (curr && curr !== '/') {
        if (fs.existsSync(path.join(curr, 'pnpm-workspace.yaml'))) {
            return curr;
        } else {
            curr = path.dirname(curr);
        }
    }
    return undefined;
}

export function getWorkspaceNpmCacheFolder(start: string) {
    const root = getWorkspaceRoot(start);
    return root ? path.join(root, '.npmcache') : './.npmcache';
}

const MODEL_PRELUDE = `
datasource db {
    provider = 'sqlite'
    url = 'file:./test.db'
}

generator js {
    provider = 'prisma-client-js'
    output = '../.prisma'
    previewFeatures = ['clientExtensions']
}

plugin meta {
    provider = '@core/model-meta'
    output = '.zenstack'
}

plugin policy {
    provider = '@core/access-policy'
    output = '.zenstack'
}

plugin zod {
    provider = '@core/zod'
    output = '.zenstack/zod'
}
`;

export async function loadSchemaFromFile(schemaFile: string, addPrelude = true, pushDb = true) {
    const content = fs.readFileSync(schemaFile, { encoding: 'utf-8' });
    return loadSchema(content, addPrelude, pushDb);
}

export async function loadSchema(schema: string, addPrelude = true, pushDb = true) {
    const { name: workDir } = tmp.dirSync();

    const root = getWorkspaceRoot(__dirname);
    if (!root) {
        throw new Error('Could not find workspace root');
    }
    console.log('Workspace root:', root);

    const pkgContent = fs.readFileSync(path.join(__dirname, 'package.template.json'), { encoding: 'utf-8' });
    fs.writeFileSync(path.join(workDir, 'package.json'), pkgContent.replaceAll('<root>', root));

    const npmrcContent = fs.readFileSync(path.join(__dirname, '.npmrc.template'), { encoding: 'utf-8' });
    fs.writeFileSync(path.join(workDir, '.npmrc'), npmrcContent.replaceAll('<root>', root));

    console.log('Workdir:', workDir);
    process.chdir(workDir);

    const content = addPrelude ? `${MODEL_PRELUDE}\n${schema}` : schema;
    fs.writeFileSync('schema.zmodel', content);
    run('npm install');
    run('npx zenstack generate --no-dependency-check', { NODE_PATH: './node_modules' });

    if (pushDb) {
        run('npx prisma db push');
    }

    const PrismaClient = require(path.join(workDir, '.prisma')).PrismaClient;
    const prisma = new PrismaClient({ log: ['info', 'warn', 'error'] });

    const policy = require(path.join(workDir, '.zenstack/policy')).default;
    const modelMeta = require(path.join(workDir, '.zenstack/model-meta')).default;
    const zodSchemas = require(path.join(workDir, '.zenstack/zod')).default;

    return {
        prisma,
        withPolicy: (user?: AuthUser) => withPolicy<WeakDbClientContract>(prisma, { user }, policy, modelMeta),
        withOmit: () => withOmit<WeakDbClientContract>(prisma, modelMeta),
        withPassword: () => withPassword<WeakDbClientContract>(prisma, modelMeta),
        withPresets: (user?: AuthUser) => withPresets<WeakDbClientContract>(prisma, { user }, policy, modelMeta),
        zodSchemas,
    };
}
