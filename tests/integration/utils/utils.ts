import { AuthUser, DbOperations, withOmit, withPassword, withPolicy, withPresets } from '@zenstackhq/runtime';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const MODEL_PRELUDE = `
datasource db {
    provider = 'sqlite'
    url = 'file:./operations.db'
}

generator js {
    provider = 'prisma-client-js'
    output = '../.prisma'
    previewFeatures = ['clientExtensions']
}

plugin meta {
    provider = '@zenstack/model-meta'
    output = '.zenstack'
}

plugin policy {
    provider = '@zenstack/access-policy'
    output = '.zenstack'
}
`;

export function run(cmd: string, env?: Record<string, string>, cwd?: string) {
    execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, DO_NOT_TRACK: '1', ...env },
        cwd,
    });
}

export type WeakDbClientContract = Record<string, WeakDbOperations> & {
    $on(eventType: any, callback: (event: any) => void): void;
    $use(cb: any): void;
    $disconnect: () => Promise<void>;
    $transaction: (input: ((tx: WeakDbClientContract) => Promise<any>) | any[], options?: any) => Promise<any>;
    $queryRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<any>;
    $executeRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<number>;
    $extends: (args: any) => WeakDbClientContract;
};

export type WeakDbOperations = {
    [key in keyof DbOperations]: (...args: any[]) => Promise<any>;
};

export async function loadPrismaFromModelFile(testName: string, modelFile: string) {
    const content = fs.readFileSync(modelFile, { encoding: 'utf-8' });
    return loadPrisma(testName, content);
}

export async function loadPrisma(testName: string, model: string) {
    const workDir = path.resolve('test-run/cases', testName);
    if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workDir, { recursive: true });
    process.chdir(workDir);

    fs.writeFileSync('schema.zmodel', model);
    run('npx zenstack generate');
    run('npx prisma db push');

    const PrismaClient = require(path.join(workDir, '.prisma')).PrismaClient;
    const prisma = new PrismaClient({ log: ['info', 'warn', 'error'] });

    const policy = require(path.join(workDir, '.zenstack/policy')).default;
    const modelMeta = require(path.join(workDir, '.zenstack/model-meta')).default;

    return {
        prisma,
        withPolicy: (user?: AuthUser) => withPolicy<WeakDbClientContract>(prisma, { user }, policy, modelMeta),
        withOmit: () => withOmit<WeakDbClientContract>(prisma, modelMeta),
        withPassword: () => withPassword<WeakDbClientContract>(prisma, modelMeta),
        withPresets: (user?: AuthUser) => withPresets<WeakDbClientContract>(prisma, { user }, policy, modelMeta),
    };
}
