import { invariant } from '@zenstackhq/common-helpers';
import type { Model } from '@zenstackhq/language/ast';
import { ZenStackClient, type ClientContract, type ClientOptions } from '@zenstackhq/orm';
import type { DataSourceProviderType, SchemaDef } from '@zenstackhq/orm/schema';
import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { PrismaSchemaGenerator } from '@zenstackhq/sdk';
import SQLite from 'better-sqlite3';
import { glob } from 'glob';
import { MysqlDialect, PostgresDialect, SqliteDialect, type LogEvent } from 'kysely';
import { createPool as createMysqlPool } from 'mysql2';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client as PGClient, Pool } from 'pg';
import { match } from 'ts-pattern';
import { expect } from 'vitest';
import { createTestProject } from './project';
import { generateTsSchema } from './schema';
import { loadDocumentWithPlugins } from './utils';

export function getTestDbProvider() {
    const val = process.env['TEST_DB_PROVIDER'] ?? 'sqlite';
    if (!['sqlite', 'postgresql', 'mysql'].includes(val!)) {
        throw new Error(`Invalid TEST_DB_PROVIDER value: ${val}`);
    }
    return val as 'sqlite' | 'postgresql' | 'mysql';
}

export const TEST_PG_CONFIG = {
    host: process.env['TEST_PG_HOST'] ?? 'localhost',
    port: process.env['TEST_PG_PORT'] ? parseInt(process.env['TEST_PG_PORT']) : 5432,
    user: process.env['TEST_PG_USER'] ?? 'postgres',
    password: process.env['TEST_PG_PASSWORD'] ?? 'postgres',
};

export const TEST_PG_URL = `postgres://${TEST_PG_CONFIG.user}:${TEST_PG_CONFIG.password}@${TEST_PG_CONFIG.host}:${TEST_PG_CONFIG.port}`;

export const TEST_MYSQL_CONFIG = {
    host: process.env['TEST_MYSQL_HOST'] ?? 'localhost',
    port: process.env['TEST_MYSQL_PORT'] ? parseInt(process.env['TEST_MYSQL_PORT']) : 3306,
    user: process.env['TEST_MYSQL_USER'] ?? 'root',
    password: process.env['TEST_MYSQL_PASSWORD'] ?? 'mysql',
    timezone: 'Z',
};

export const TEST_MYSQL_URL = `mysql://${TEST_MYSQL_CONFIG.user}:${TEST_MYSQL_CONFIG.password}@${TEST_MYSQL_CONFIG.host}:${TEST_MYSQL_CONFIG.port}`;

type ExtraTestClientOptions = {
    /**
     * Database provider
     */
    provider?: 'sqlite' | 'postgresql' | 'mysql';

    /**
     * The main ZModel file. Only used when `usePrismaPush` is true and `schema` is an object.
     */
    schemaFile?: string;

    /**
     * Database name. If not provided, a name will be generated based on the test name.
     */
    dbName?: string;

    /**
     * Use `prisma db push` instead of ZenStack's `$pushSchema` for database initialization.
     */
    usePrismaPush?: boolean;

    /**
     * Extra ZModel files to be created in the working directory.
     */
    extraZModelFiles?: Record<string, string>;

    /**
     * Extra TypeScript source files to create and compile.
     */
    extraSourceFiles?: Record<string, string>;

    /**
     * Working directory for the test client. If not provided, a temporary directory will be created.
     */
    workDir?: string;

    /**
     * Debug mode.
     */
    debug?: boolean;

    /**
     * A sqlite database file to be used for the test. Only supported for sqlite provider.
     */
    dbFile?: string;

    /**
     * PostgreSQL extensions to be added to the datasource. Only supported for postgresql provider.
     */
    dataSourceExtensions?: string[];

    /**
     * Additional files to be copied to the working directory. The glob pattern is relative to the test file.
     */
    copyFiles?: {
        globPattern: string;
        destination: string;
    }[];

    /**
     * Computed fields configuration for tests.
     */
    computedFields?: import('@zenstackhq/orm').ComputedFieldsOptions<any>;
};

export type CreateTestClientOptions<Schema extends SchemaDef> = Omit<ClientOptions<Schema>, 'dialect'> &
    ExtraTestClientOptions;

export async function createTestClient<
    Schema extends SchemaDef,
    Options extends ClientOptions<Schema>,
    CreateOptions = Omit<Options, 'dialect'>,
>(schema: Schema, options?: CreateOptions): Promise<ClientContract<Schema, Options>>;
export async function createTestClient(schema: string, options?: CreateTestClientOptions<SchemaDef>): Promise<any>;
export async function createTestClient(
    schema: SchemaDef | string,
    options?: CreateTestClientOptions<SchemaDef>,
): Promise<any> {
    let workDir = options?.workDir;
    let _schema: SchemaDef;
    const provider = options?.provider ?? getTestDbProvider() ?? 'sqlite';
    const dbName = options?.dbName ?? getTestDbName(provider);
    const dbUrl = match(provider)
        .with('sqlite', () => `file:${dbName}`)
        .with('mysql', () => `${TEST_MYSQL_URL}/${dbName}`)
        .with('postgresql', () => `${TEST_PG_URL}/${dbName}`)
        .exhaustive();
    let model: Model | undefined;

    if (typeof schema === 'string') {
        const generated = await generateTsSchema(
            schema,
            provider,
            dbUrl,
            options?.extraSourceFiles,
            undefined,
            options?.extraZModelFiles,
        );
        workDir = generated.workDir;
        model = generated.model;
        // replace schema's provider
        _schema = {
            ...generated.schema,
            provider: {
                ...generated.schema.provider,
                type: provider,
            },
        } as SchemaDef;
    } else {
        // replace schema's provider
        _schema = {
            ...schema,
            provider: {
                type: provider,
            },
        };
        workDir ??= createTestProject();
        if (options?.schemaFile) {
            let schemaContent = fs.readFileSync(options.schemaFile, 'utf-8');
            if (dbUrl) {
                // replace `datasource db { }` section
                schemaContent = schemaContent.replace(
                    /datasource\s+db\s*{[^}]*}/m,
                    `datasource db {
    provider = '${provider}'
    url = '${dbUrl}'
    ${options.dataSourceExtensions ? `extensions = [${options.dataSourceExtensions.join(', ')}]` : ''}
}`,
                );
            }
            fs.writeFileSync(path.join(workDir!, 'schema.zmodel'), schemaContent);
        }
    }

    invariant(workDir);

    const { plugins, ...rest } = options ?? {};
    const _options = {
        ...rest,
    } as ClientOptions<SchemaDef>;

    if (options?.debug) {
        console.log(`Work directory: ${workDir}`);
        console.log(`Database name: ${dbName}`);
        _options.log ??= testLogger;
    }

    // copy db file to workDir if specified
    if (options?.dbFile) {
        if (provider !== 'sqlite') {
            throw new Error('dbFile option is only supported for sqlite provider');
        }
        fs.copyFileSync(options.dbFile, path.join(workDir, dbName));
    }

    // copy additional files if specified
    if (options?.copyFiles) {
        const state = expect.getState();
        const currentTestPath = state.testPath;
        if (!currentTestPath) {
            throw new Error('Unable to determine current test file path');
        }
        for (const { globPattern, destination } of options.copyFiles) {
            const files = glob.sync(globPattern, { cwd: path.dirname(currentTestPath) });
            for (const file of files) {
                const src = path.resolve(path.dirname(currentTestPath), file);
                const dest = path.resolve(workDir, destination, path.basename(file));
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                fs.copyFileSync(src, dest);
            }
        }
    }

    if (!options?.dbFile) {
        if (options?.usePrismaPush) {
            invariant(
                typeof schema === 'string' || options?.schemaFile,
                'a schema file must be provided when using prisma db push',
            );
            if (!model) {
                const r = await loadDocumentWithPlugins(path.join(workDir, 'schema.zmodel'));
                if (!r.success) {
                    throw new Error(r.errors.join('\n'));
                }
                model = r.model;
            }
            const prismaSchema = new PrismaSchemaGenerator(model);
            const prismaSchemaText = await prismaSchema.generate();
            fs.writeFileSync(path.resolve(workDir!, 'schema.prisma'), prismaSchemaText);
            execSync('npx prisma db push --schema ./schema.prisma --skip-generate --force-reset', {
                cwd: workDir,
                stdio: options.debug ? 'inherit' : 'ignore',
            });
        } else {
            await prepareDatabase(provider, dbName);
        }
    }

    // create Kysely dialect
    _options.dialect = createDialect(provider, dbName, workDir);

    let client = new ZenStackClient(_schema, _options);

    if (!options?.usePrismaPush && !options?.dbFile) {
        await client.$pushSchema();
    }

    // install plugins
    if (plugins) {
        for (const plugin of plugins) {
            client = client.$use(plugin);
        }
    }

    return client;
}

function createDialect(provider: DataSourceProviderType, dbName: string, workDir: string) {
    return match(provider)
        .with(
            'postgresql',
            () =>
                new PostgresDialect({
                    pool: new Pool({
                        ...TEST_PG_CONFIG,
                        database: dbName,
                    }),
                }),
        )
        .with(
            'mysql',
            () =>
                new MysqlDialect({
                    pool: createMysqlPool({
                        ...TEST_MYSQL_CONFIG,
                        database: dbName,
                    }),
                }),
        )
        .with(
            'sqlite',
            () =>
                new SqliteDialect({
                    database: new SQLite(path.join(workDir!, dbName)),
                }),
        )
        .exhaustive();
}

async function prepareDatabase(provider: string, dbName: string) {
    if (provider === 'postgresql') {
        invariant(dbName, 'dbName is required');
        const pgClient = new PGClient(TEST_PG_CONFIG);
        await pgClient.connect();
        await pgClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        await pgClient.query(`CREATE DATABASE "${dbName}"`);
        await pgClient.end();
    } else if (provider === 'mysql') {
        invariant(dbName, 'dbName is required');
        const mysqlPool = createMysqlPool(TEST_MYSQL_CONFIG);
        await mysqlPool.promise().query(`DROP DATABASE IF EXISTS \`${dbName}\``);
        await mysqlPool.promise().query(`CREATE DATABASE \`${dbName}\``);
        await mysqlPool.promise().end();
    }
}

export async function createPolicyTestClient<Schema extends SchemaDef>(
    schema: Schema,
    options?: CreateTestClientOptions<Schema>,
): Promise<ClientContract<Schema>>;
export async function createPolicyTestClient<Schema extends SchemaDef>(
    schema: string,
    options?: CreateTestClientOptions<Schema>,
): Promise<any>;
export async function createPolicyTestClient<Schema extends SchemaDef>(
    schema: Schema | string,
    options?: CreateTestClientOptions<Schema>,
): Promise<any> {
    return createTestClient(
        schema as any,
        {
            ...options,
            plugins: [...(options?.plugins ?? []), new PolicyPlugin()],
        } as any,
    );
}

export function testLogger(e: LogEvent) {
    console.log(e.query.sql, e.query.parameters);
}

function getTestDbName(provider: string) {
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
