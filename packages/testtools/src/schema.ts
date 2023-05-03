/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DMMF } from '@prisma/generator-helper';
import { getDMMF } from '@prisma/internals';
import type { Model } from '@zenstackhq/language/ast';
import { withOmit, withPassword, withPolicy, withPresets, type AuthUser, type DbOperations } from '@zenstackhq/runtime';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import tmp from 'tmp';
import { loadDocument } from 'zenstack/cli/cli-util';
import prismaPlugin from 'zenstack/plugins/prisma';

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

function normalizePath(p: string) {
    return p ? p.split(path.sep).join(path.posix.sep) : p;
}

export function getWorkspaceRoot(start: string) {
    let curr = normalizePath(start);
    while (curr && curr !== '/') {
        if (fs.existsSync(path.join(curr, 'pnpm-workspace.yaml'))) {
            return curr;
        } else {
            curr = normalizePath(path.dirname(curr));
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

export async function loadSchema(
    schema: string,
    addPrelude = true,
    pushDb = true,
    extraDependencies: string[] = [],
    compile = false
) {
    const { name: projectRoot } = tmp.dirSync({ unsafeCleanup: true });

    try {
        const root = getWorkspaceRoot(__dirname);

        if (!root) {
            throw new Error('Could not find workspace root');
        }

        console.log('Workspace root:', root);

        const pkgContent = fs.readFileSync(path.join(__dirname, 'package.template.json'), { encoding: 'utf-8' });
        fs.writeFileSync(path.join(projectRoot, 'package.json'), pkgContent.replaceAll('<root>', root));

        const npmrcContent = fs.readFileSync(path.join(__dirname, '.npmrc.template'), { encoding: 'utf-8' });
        fs.writeFileSync(path.join(projectRoot, '.npmrc'), npmrcContent.replaceAll('<root>', root));

        console.log('Workdir:', projectRoot);
        process.chdir(projectRoot);

        schema = schema.replaceAll('$projectRoot', projectRoot);

        const content = addPrelude ? `${MODEL_PRELUDE}\n${schema}` : schema;
        fs.writeFileSync('schema.zmodel', content);
        run('npm install');
        run('npx zenstack generate --no-dependency-check', { NODE_PATH: './node_modules' });

        if (pushDb) {
            run('npx prisma db push');
        }

        const PrismaClient = require(path.join(projectRoot, 'node_modules/.prisma/client')).PrismaClient;
        const prisma = new PrismaClient({ log: ['info', 'warn', 'error'] });

        extraDependencies.forEach((dep) => {
            console.log(`Installing dependency ${dep}`);
            run(`npm install ${dep}`);
        });

        if (compile) {
            console.log('Compiling...');
            run('npx tsc --init');
            run('npx tsc --project tsconfig.json');
        }

        const policy = require(path.join(projectRoot, '.zenstack/policy')).default;
        const modelMeta = require(path.join(projectRoot, '.zenstack/model-meta')).default;
        const zodSchemas = require(path.join(projectRoot, '.zenstack/zod'));

        return {
            projectDir: projectRoot,
            prisma,
            withPolicy: (user?: AuthUser) => withPolicy<WeakDbClientContract>(prisma, { user }, policy, modelMeta),
            withOmit: () => withOmit<WeakDbClientContract>(prisma, modelMeta),
            withPassword: () => withPassword<WeakDbClientContract>(prisma, modelMeta),
            withPresets: (user?: AuthUser) => withPresets<WeakDbClientContract>(prisma, { user }, policy, modelMeta),
            policy,
            modelMeta,
            zodSchemas,
        };
    } catch (err) {
        fs.rmSync(projectRoot, { recursive: true, force: true });
        throw err;
    }
}

/**
 * Load ZModel and Prisma DMM from a string without creating a NPM project.
 * @param content
 * @returns
 */
export async function loadZModelAndDmmf(
    content: string
): Promise<{ model: Model; dmmf: DMMF.Document; modelFile: string }> {
    const prelude = `
    datasource db {
        provider = 'postgresql'
        url = env('DATABASE_URL')
    }
`;

    const { name: modelFile } = tmp.fileSync({ postfix: '.zmodel' });
    fs.writeFileSync(modelFile, `${prelude}\n${content}`);

    const model = await loadDocument(modelFile);

    const { name: prismaFile } = tmp.fileSync({ postfix: '.prisma' });
    await prismaPlugin(model, { schemaPath: modelFile, output: prismaFile, generateClient: false });

    const prismaContent = fs.readFileSync(prismaFile, { encoding: 'utf-8' });

    const dmmf = await getDMMF({ datamodel: prismaContent });
    return { model, dmmf, modelFile };
}
