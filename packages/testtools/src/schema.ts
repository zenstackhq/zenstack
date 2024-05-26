/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Model } from '@zenstackhq/language/ast';
import {
    DEFAULT_RUNTIME_LOAD_PATH,
    PolicyDef,
    type AuthUser,
    type CrudContract,
    type EnhancementKind,
    type EnhancementOptions,
} from '@zenstackhq/runtime';
import { getDMMF, type DMMF } from '@zenstackhq/sdk/prisma';
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

tmp.setGracefulCleanup();

export type FullDbClientContract = CrudContract & {
    $on(eventType: any, callback: (event: any) => void): void;
    $use(cb: any): void;
    $disconnect: () => Promise<void>;
    $transaction: (input: ((tx: FullDbClientContract) => Promise<any>) | any[], options?: any) => Promise<any>;
    $queryRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<any>;
    $executeRaw: (query: TemplateStringsArray, ...args: any[]) => Promise<number>;
    $extends: (args: any) => FullDbClientContract;
};

export function run(cmd: string, env?: Record<string, string>, cwd?: string) {
    try {
        execSync(cmd, {
            stdio: 'pipe',
            encoding: 'utf-8',
            env: { ...process.env, DO_NOT_TRACK: '1', ...env },
            cwd,
        });
    } catch (err) {
        console.error('Command failed:', cmd, err);
        throw err;
    }
}

export function installPackage(pkg: string, dev = false) {
    run(`npm install ${dev ? '-D' : ''} --no-audit --no-fund ${pkg}`);
}

export function normalizePath(p: string) {
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
    ${options.previewFeatures ? `previewFeatures = ${JSON.stringify(options.previewFeatures)}` : ''}
}

plugin enhancer {
    provider = '@core/enhancer'
    ${options.preserveTsFiles ? 'preserveTsFiles = true' : ''}
    ${options.generatePermissionChecker ? 'generatePermissionChecker = true' : ''}
}

plugin zod {
    provider = '@core/zod'
    ${options.preserveTsFiles ? 'preserveTsFiles = true' : ''}
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
    enhancements?: EnhancementKind[];
    enhanceOptions?: Partial<EnhancementOptions>;
    extraSourceFiles?: { name: string; content: string }[];
    projectDir?: string;
    preserveTsFiles?: boolean;
    generatePermissionChecker?: boolean;
    previewFeatures?: string[];
};

const defaultOptions: SchemaLoadOptions = {
    addPrelude: true,
    pushDb: true,
    fullZod: false,
    extraDependencies: [],
    compile: false,
    logPrismaQuery: false,
    provider: 'sqlite',
    preserveTsFiles: false,
};

export async function loadSchemaFromFile(schemaFile: string, options?: SchemaLoadOptions) {
    const content = fs.readFileSync(schemaFile, { encoding: 'utf-8' });
    return loadSchema(content, options);
}

export async function loadSchema(schema: string, options?: SchemaLoadOptions) {
    const opt = { ...defaultOptions, ...options };

    let projectDir = opt.projectDir;
    if (!projectDir) {
        const r = tmp.dirSync({ unsafeCleanup: true });
        projectDir = r.name;
    }

    const workspaceRoot = getWorkspaceRoot(__dirname);

    if (!workspaceRoot) {
        throw new Error('Could not find workspace root');
    }

    console.log('Workdir:', projectDir);
    process.chdir(projectDir);

    // copy project structure from scaffold (prepared by test-setup.ts)
    fs.cpSync(path.join(workspaceRoot, '.test/scaffold'), projectDir, { recursive: true, force: true });

    // install local deps
    const localInstallDeps = [
        'packages/schema/dist',
        'packages/runtime/dist',
        'packages/plugins/swr/dist',
        'packages/plugins/trpc/dist',
        'packages/plugins/openapi/dist',
    ];

    run(`npm i --no-audit --no-fund ${localInstallDeps.map((d) => path.join(workspaceRoot, d)).join(' ')}`);

    let zmodelPath = path.join(projectDir, 'schema.zmodel');

    const files = schema.split(FILE_SPLITTER);

    // Use this one to replace $projectRoot placeholder in the schema file
    const normalizedProjectRoot = normalizePath(projectDir);

    if (files.length > 1) {
        // multiple files
        files.forEach((file, index) => {
            //first line is the file name
            const firstLine = file.indexOf('\n');
            const fileName = file.substring(0, firstLine).trim();
            let fileContent = file.substring(firstLine + 1);
            if (index === 0) {
                // The first file is the main schema file
                zmodelPath = path.join(projectDir, fileName);
                if (opt.addPrelude) {
                    // plugin need to be added after import statement
                    fileContent = `${fileContent}\n${makePrelude(opt)}`;
                }
            }

            fileContent = fileContent.replaceAll('$projectRoot', normalizedProjectRoot);
            const filePath = path.join(projectDir, fileName);
            fs.writeFileSync(filePath, fileContent);
        });
    } else {
        schema = schema.replaceAll('$projectRoot', normalizedProjectRoot);
        const content = opt.addPrelude ? `${makePrelude(opt)}\n${schema}` : schema;
        if (opt.customSchemaFilePath) {
            zmodelPath = path.join(projectDir, opt.customSchemaFilePath);
            fs.mkdirSync(path.dirname(zmodelPath), { recursive: true });
            fs.writeFileSync(zmodelPath, content);
        } else {
            fs.writeFileSync('schema.zmodel', content);
        }
    }

    const outputArg = opt.output ? ` --output ${opt.output}` : '';

    if (opt.customSchemaFilePath) {
        run(`npx zenstack generate --no-version-check --schema ${zmodelPath} --no-dependency-check${outputArg}`, {
            NODE_PATH: './node_modules',
        });
    } else {
        run(`npx zenstack generate --no-version-check --no-dependency-check${outputArg}`, {
            NODE_PATH: './node_modules',
        });
    }

    if (opt.pushDb) {
        run('npx prisma db push');
    }

    if (opt.pulseApiKey) {
        opt.extraDependencies?.push('@prisma/extension-pulse');
    }

    if (opt.extraDependencies) {
        console.log(`Installing dependency ${opt.extraDependencies.join(' ')}`);
        installPackage(opt.extraDependencies.join(' '));
    }

    opt.copyDependencies?.forEach((dep) => {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(dep, 'package.json'), { encoding: 'utf-8' }));
        fs.cpSync(dep, path.join(projectDir, 'node_modules', pkgJson.name), { recursive: true, force: true });
    });

    const PrismaClient = require(path.join(projectDir, 'node_modules/.prisma/client')).PrismaClient;
    let prisma = new PrismaClient({ log: ['info', 'warn', 'error'] });
    // https://github.com/prisma/prisma/issues/18292
    prisma[Symbol.for('nodejs.util.inspect.custom')] = 'PrismaClient';

    const prismaModule = require(path.join(projectDir, 'node_modules/@prisma/client')).Prisma;

    if (opt.pulseApiKey) {
        const withPulse = require(path.join(projectDir, 'node_modules/@prisma/extension-pulse/dist/cjs')).withPulse;
        prisma = prisma.$extends(withPulse({ apiKey: opt.pulseApiKey }));
    }

    opt.extraSourceFiles?.forEach(({ name, content }) => {
        fs.writeFileSync(path.join(projectDir, name), content);
    });

    if (opt.extraSourceFiles && opt.extraSourceFiles.length > 0 && !opt.compile) {
        console.warn('`extraSourceFiles` is true but `compile` is false.');
    }

    if (opt.compile) {
        console.log('Compiling...');

        run('npx tsc --init');

        // add generated '.zenstack/zod' folder to typescript's search path,
        // so that it can be resolved from symbolic-linked files
        const tsconfig = json.parse(fs.readFileSync(path.join(projectDir, './tsconfig.json'), 'utf-8'));
        tsconfig.compilerOptions.paths = {
            '.zenstack/zod/input': ['./node_modules/.zenstack/zod/input/index.d.ts'],
            '.zenstack/models': ['./node_modules/.zenstack/models.d.ts'],
        };
        tsconfig.include = ['**/*.ts'];
        tsconfig.exclude = ['node_modules'];
        fs.writeFileSync(path.join(projectDir, './tsconfig.json'), JSON.stringify(tsconfig, null, 2));
        run('npx tsc --project tsconfig.json');
    }

    if (options?.getPrismaOnly) {
        return {
            prisma,
            prismaModule,
            projectDir,
            enhance: undefined as any,
            enhanceRaw: undefined as any,
            policy: undefined as unknown as PolicyDef,
            modelMeta: undefined as any,
            zodSchemas: undefined as any,
        };
    }

    const outputPath = opt.output
        ? path.isAbsolute(opt.output)
            ? opt.output
            : path.join(projectDir, opt.output)
        : path.join(projectDir, 'node_modules', DEFAULT_RUNTIME_LOAD_PATH);

    const policy: PolicyDef = require(path.join(outputPath, 'policy')).default;
    const modelMeta = require(path.join(outputPath, 'model-meta')).default;

    let zodSchemas: any;
    try {
        zodSchemas = require(path.join(outputPath, 'zod'));
    } catch {
        /* noop */
    }

    const enhance = require(path.join(outputPath, 'enhance')).enhance;

    return {
        projectDir: projectDir,
        prisma,
        enhance: (user?: AuthUser, options?: EnhancementOptions): FullDbClientContract =>
            enhance(
                prisma,
                { user },
                {
                    policy,
                    modelMeta,
                    zodSchemas,
                    logPrismaQuery: opt.logPrismaQuery,
                    transactionTimeout: 1000000,
                    kinds: opt.enhancements,
                    ...(options ?? opt.enhanceOptions),
                }
            ),
        enhanceRaw: enhance,
        policy,
        modelMeta,
        zodSchemas,
        prismaModule,
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
    await prismaPlugin(
        model,
        {
            provider: '@core/plugin',
            schemaPath: modelFile,
            output: prismaFile,
            generateClient: false,
        },
        undefined,
        undefined
    );

    const prismaContent = fs.readFileSync(prismaFile, { encoding: 'utf-8' });

    const dmmf = await getDMMF({ datamodel: prismaContent });
    return { model, dmmf, modelFile };
}
