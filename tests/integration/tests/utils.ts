import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { AuthUser, DbOperations, withPolicy } from '@zenstackhq/runtime';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export function run(cmd: string) {
    execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, DO_NOT_TRACK: '1' },
    });
}

export type WeakDbClientContract = Record<string, WeakDbOperations> & {
    $disconnect: () => Promise<void>;
};

export type WeakDbOperations = {
    [key in keyof DbOperations]: (...args: any[]) => Promise<any>;
};

export async function loadPrisma(testName: string, model: string) {
    const workDir = path.resolve('tests/test-run/cases', testName);
    if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
    fs.mkdirSync(workDir, { recursive: true });
    process.chdir(workDir);
    fs.writeFileSync('schema.zmodel', model);
    run('npx zenstack generate');
    run('npx prisma db push');

    const PrismaClient = require(path.join(workDir, '.prisma')).PrismaClient;
    const prisma = new PrismaClient();

    const policy = require(path.join(workDir, 'policy')).default;
    return {
        prisma,
        withPolicy: (user?: AuthUser) =>
            withPolicy<WeakDbClientContract>(prisma, policy, { user }),
    };
}

export async function expectNotFound(fn: () => Promise<unknown>) {
    try {
        await fn();
    } catch (err) {
        expect((err as PrismaClientKnownRequestError).code).toBe('P2025');
        return;
    }
    throw new Error('PrismaClientKnownRequestError("P2025") expected');
}

export async function expectPolicyDeny(fn: () => Promise<unknown>) {
    try {
        await fn();
    } catch (err) {
        if ((err as PrismaClientKnownRequestError).code !== 'P2004') {
            console.error('Wrong error:', err);
        }
        expect((err as PrismaClientKnownRequestError).code).toBe('P2004');
        return;
    }
    throw new Error('PrismaClientKnownRequestError("P2004") expected');
}
