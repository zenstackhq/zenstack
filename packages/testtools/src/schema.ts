/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DMMF } from '@prisma/generator-helper';
import type { Model } from '@zenstackhq/language/ast';
import { enhance, withOmit, withPassword, withPolicy, type AuthUser, type DbOperations } from '@zenstackhq/runtime';
import { getDMMF } from '@zenstackhq/sdk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import json from 'json5';
import * as path from 'path';
import tmp from 'tmp';
import { loadDocument } from 'zenstack/cli/cli-util';
import prismaPlugin from 'zenstack/plugins/prisma';

/** 
 * Use it to represent multiple files in a single string like this
   `schema.zmodel
    import "user"
    ${FILE_SPLITTER}user.zmodel
    import "schema"
    model User {
    ...
    }`
*/
export const FILE_SPLITTER = '#FILE_SPLITTER#';

export type FullDbClientContract = Record<string, DbOperations> & {
    $on(eventType: any, callback: (event: any) => void): void;
    $use(cb: any): void;
    $disconnect: () => Promise<void>;
    $transaction: (input: ((tx: FullDbClientContract) => Promise<any>) | any[], options?: any) => Promise<any>;
    $queryRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<any>;
    $executeRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<number>;
    $extends: (args: any) => FullDbClientContract;
};

export function run(cmd: string, env?: Record<string, string>, cwd?: string) {
    const start = Date.now();
    execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, DO_NOT_TRACK: '1', ...env },
        cwd,
    });
    console.log('Execution took', Date.now() - start, 'ms', '-', cmd);
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

function makePrelude(options: SchemaLoadOptions) {
    let dbUrl = options.dbUrl ?? (options.provider === 'postgresql' ? 'env("DATABASE_URL")' : 'file:./dev.db');

    if (!dbUrl.includes('env(') && !dbUrl.startsWith("'") && !dbUrl.startsWith('"')) {
        dbUrl = `'${dbUrl}'`;
    }

    return `
datasource db {
    provider = '${options.provider}'
    url = ${dbUrl}
}

generator js {
    provider = 'prisma-client-js'
    previewFeatures = ['clientExtensions']
}

plugin meta {
    provider = '@core/model-meta'
    preserveTsFiles = true
}

plugin policy {
    provider = '@core/access-policy'
    preserveTsFiles = true
}

plugin zod {
    provider = '@core/zod'
    preserveTsFiles = true
    modelOnly = ${!options.fullZod}
}
`;
}

export type SchemaLoadOptions = {
    addPrelude?: boolean;
    pushDb?: boolean;
    fullZod?: boolean;
    extraDependencies?: string[];
    copyDependencies?: string[];
    compile?: boolean;
    customSchemaFilePath?: string;
    output?: string;
    logPrismaQuery?: boolean;
    provider?: 'sqlite' | 'postgresql';
    dbUrl?: string;
    pulseApiKey?: string;
    getPrismaOnly?: boolean;
};

const defaultOptions: SchemaLoadOptions = {
    addPrelude: true,
    pushDb: true,
    fullZod: false,
    extraDependencies: [],
    compile: false,
    logPrismaQuery: false,
    provider: 'sqlite',
};

export async function loadSchemaFromFile(schemaFile: string, options?: SchemaLoadOptions) {
    const content = fs.readFileSync(schemaFile, { encoding: 'utf-8' });
    return loadSchema(content, options);
}

export async function loadSchema(schema: string, options?: SchemaLoadOptions) {
    const opt = { ...defaultOptions, ...options };

    const { name: projectRoot } = tmp.dirSync({ unsafeCleanup: true });

    const root = getWorkspaceRoot(__dirname);

    if (!root) {
        throw new Error('Could not find workspace root');
    }

    const pkgContent = fs.readFileSync(path.join(__dirname, 'package.template.json'), { encoding: 'utf-8' });
    fs.writeFileSync(path.join(projectRoot, 'package.json'), pkgContent.replaceAll('<root>', root));

    const npmrcContent = fs.readFileSync(path.join(__dirname, '.npmrc.template'), { encoding: 'utf-8' });
    fs.writeFileSync(path.join(projectRoot, '.npmrc'), npmrcContent.replaceAll('<root>', root));

    console.log('Workdir:', projectRoot);
    process.chdir(projectRoot);

    let zmodelPath = path.join(projectRoot, 'schema.zmodel');

    const files = schema.split(FILE_SPLITTER);

    if (files.length > 1) {
        // multiple files
        files.forEach((file, index) => {
            //first line is the file name
            const firstLine = file.indexOf('\n');
            const fileName = file.substring(0, firstLine).trim();
            let fileContent = file.substring(firstLine + 1);
            if (index === 0) {
                // The first file is the main schema file
                zmodelPath = path.join(projectRoot, fileName);
                if (opt.addPrelude) {
                    // plugin need to be added after import statement
                    fileContent = `${fileContent}\n${makePrelude(opt)}`;
                }
            }

            fileContent = fileContent.replaceAll('$projectRoot', projectRoot);
            const filePath = path.join(projectRoot, fileName);
            fs.writeFileSync(filePath, fileContent);
        });
    } else {
        schema = schema.replaceAll('$projectRoot', projectRoot);
        const content = opt.addPrelude ? `${makePrelude(opt)}\n${schema}` : schema;
        if (opt.customSchemaFilePath) {
            zmodelPath = path.join(projectRoot, opt.customSchemaFilePath);
            fs.mkdirSync(path.dirname(zmodelPath), { recursive: true });
            fs.writeFileSync(zmodelPath, content);
        } else {
            fs.writeFileSync('schema.zmodel', content);
        }
    }

    run('npm install');

    const outputArg = opt.output ? ` --output ${opt.output}` : '';

    if (opt.customSchemaFilePath) {
        run(`npx zenstack generate --schema ${zmodelPath} --no-dependency-check${outputArg}`, {
            NODE_PATH: './node_modules',
        });
    } else {
        run(`npx zenstack generate --no-dependency-check${outputArg}`, { NODE_PATH: './node_modules' });
    }

    if (opt.pushDb) {
        run('npx prisma db push');
    }

    if (opt.pulseApiKey) {
        opt.extraDependencies?.push('@prisma/extension-pulse');
    }

    opt.extraDependencies?.forEach((dep) => {
        console.log(`Installing dependency ${dep}`);
        run(`npm install ${dep}`);
    });

    opt.copyDependencies?.forEach((dep) => {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(dep, 'package.json'), { encoding: 'utf-8' }));
        fs.cpSync(dep, path.join(projectRoot, 'node_modules', pkgJson.name), { recursive: true, force: true });
    });

    const PrismaClient = require(path.join(projectRoot, 'node_modules/.prisma/client')).PrismaClient;
    let prisma = new PrismaClient({ log: ['info', 'warn', 'error'] });

    if (opt.pulseApiKey) {
        const withPulse = require(path.join(projectRoot, 'node_modules/@prisma/extension-pulse/dist/cjs')).withPulse;
        prisma = prisma.$extends(withPulse({ apiKey: opt.pulseApiKey }));
    }

    if (opt.compile) {
        console.log('Compiling...');
        run('npx tsc --init');

        // add generated '.zenstack/zod' folder to typescript's search path,
        // so that it can be resolved from symbolic-linked files
        const tsconfig = json.parse(fs.readFileSync(path.join(projectRoot, './tsconfig.json'), 'utf-8'));
        tsconfig.compilerOptions.paths = {
            '.zenstack/zod/input': ['./node_modules/.zenstack/zod/input/index.d.ts'],
        };
        fs.writeFileSync(path.join(projectRoot, './tsconfig.json'), JSON.stringify(tsconfig, null, 2));
        run('npx tsc --project tsconfig.json');
    }

    if (options?.getPrismaOnly) {
        return {
            prisma,
            projectDir: projectRoot,
            withPolicy: undefined as any,
            withOmit: undefined as any,
            withPassword: undefined as any,
            enhance: undefined as any,
        };
    }

    let policy: any;
    let modelMeta: any;
    let zodSchemas: any;

    const outputPath = path.join(projectRoot, 'node_modules');

    try {
        policy = require(path.join(outputPath, '.zenstack/policy')).default;
    } catch {
        /* noop */
    }
    try {
        modelMeta = require(path.join(outputPath, '.zenstack/model-meta')).default;
    } catch {
        /* noop */
    }
    try {
        zodSchemas = require(path.join(outputPath, '.zenstack/zod'));
    } catch {
        /* noop */
    }

    return {
        projectDir: projectRoot,
        prisma,
        withPolicy: (user?: AuthUser) =>
            withPolicy<FullDbClientContract>(
                prisma,
                { user },
                { policy, modelMeta, zodSchemas, logPrismaQuery: opt.logPrismaQuery }
            ),
        withOmit: () => withOmit<FullDbClientContract>(prisma, { modelMeta }),
        withPassword: () => withPassword<FullDbClientContract>(prisma, { modelMeta }),
        enhance: (user?: AuthUser) =>
            enhance<FullDbClientContract>(
                prisma,
                { user },
                { policy, modelMeta, zodSchemas, logPrismaQuery: opt.logPrismaQuery }
            ),
        policy,
        modelMeta,
        zodSchemas,
    };
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
    await prismaPlugin(model, { schemaPath: modelFile, name: 'Prisma', output: prismaFile, generateClient: false });

    const prismaContent = fs.readFileSync(prismaFile, { encoding: 'utf-8' });

    const dmmf = await getDMMF({ datamodel: prismaContent });
    return { model, dmmf, modelFile };
}
