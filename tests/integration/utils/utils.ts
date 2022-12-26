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

export async function loadPrismaFromModelFile(
    testName: string,
    modelFile: string
) {
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
    const prisma = new PrismaClient({ log: ['error'] });

    const policy = require(path.join(workDir, 'policy')).default;
    return {
        prisma,
        withPolicy: (user?: AuthUser) =>
            withPolicy<WeakDbClientContract>(prisma, policy, { user }),
    };
}
