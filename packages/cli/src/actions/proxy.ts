import { serve } from '@hono/node-server';
import {
    ConfigExpr,
    InvocationExpr,
    isDataSource,
    isInvocationExpr,
    isLiteralExpr,
    LiteralExpr,
} from '@zenstackhq/language/ast';
import { getStringLiteral } from '@zenstackhq/language/utils';
import { ZenStackClient, type ClientContract } from '@zenstackhq/orm';
import { MysqlDialect } from '@zenstackhq/orm/dialects/mysql';
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres';
import { SqliteDialect } from '@zenstackhq/orm/dialects/sqlite';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import type { DataSourceProviderType } from '@zenstackhq/schema';
import type BetterSqlite3 from 'better-sqlite3';
import colors from 'colors';
import { createJiti } from 'jiti';
import type { createPool as MysqlCreatePool } from 'mysql2';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { detect, resolveCommand } from 'package-manager-detector';
import type { Pool as PgPoolType } from 'pg';
import { CliError } from '../cli-error';
import {
    createProxyApp,
    type CreateProxyAppOptions,
    createSignatureMiddleware,
    normalizePublicKey,
    ProxyAuthError,
    type ProxyAuthErrorCode,
    resolveClient,
} from '../proxy';
import { execSync } from '../utils/exec-utils';
import { getOutputPath, getSchemaFile, isPackageInstalled, loadPackage, loadSchemaDocument } from './action-utils';
import { runPull } from './db';
import { run as runGenerate } from './generate';

export {
    createProxyApp,
    type CreateProxyAppOptions,
    createSignatureMiddleware,
    normalizePublicKey,
    ProxyAuthError,
    type ProxyAuthErrorCode,
    resolveClient,
};

type Options = {
    output?: string;
    schema?: string;
    port: number;
    logLevel?: string[];
    databaseUrl?: string;
    studioAuthKey?: string;
    signatureToleranceSecs: number;
    introspect?: boolean;
};

export async function run(options: Options) {
    // Resolve public key: CLI arg takes precedence, then ZENSTACK_STUDIO_AUTH_KEY env var.
    options = { ...options, studioAuthKey: options.studioAuthKey ?? process.env['ZENSTACK_STUDIO_AUTH_KEY'] };

    const allowedLogLevels = ['error', 'query'] as const;
    const log = options.logLevel?.filter((level): level is (typeof allowedLogLevels)[number] =>
        allowedLogLevels.includes(level as any),
    );
    const schemaFile = await resolveSchema(options);
    console.log(colors.gray(`Loading ZModel schema from: ${schemaFile}`));

    let outputPath = getOutputPath(options, schemaFile);

    // Ensure outputPath is absolute
    if (!path.isAbsolute(outputPath)) {
        outputPath = path.resolve(process.cwd(), outputPath);
    }

    const model = await loadSchemaDocument(schemaFile);

    const dataSource = model.declarations.find(isDataSource);

    let databaseUrl = options.databaseUrl;

    if (!databaseUrl) {
        const schemaUrl = dataSource?.fields.find((f) => f.name === 'url')?.value;
        if (!schemaUrl) {
            throw new CliError(
                `The schema's "datasource" does not have a "url" field, please provide it with -d option.`,
            );
        }
        databaseUrl = evaluateUrl(schemaUrl);
    }

    const provider = getStringLiteral(dataSource?.fields.find((f) => f.name === 'provider')?.value)!;

    const dialect = await createDialect(provider, databaseUrl!, model.$document!.uri.path);

    const fileUrl = typeof __filename !== 'undefined' ? __filename : import.meta.url;

    const jiti = createJiti(fileUrl);

    const schemaModule = (await jiti.import(path.join(outputPath, 'schema'))) as any;

    // Build omit configuration for computed fields and Unsupported fields.
    const schema = schemaModule.schema as SchemaDef;
    const omit: Record<string, Record<string, boolean>> = {};
    for (const [modelName, modelDef] of Object.entries(schema.models)) {
        const omitFields: Record<string, boolean> = {};
        for (const [fieldName, fieldDef] of Object.entries(modelDef.fields)) {
            if (fieldDef.computed === true || fieldDef.type === 'Unsupported') {
                omitFields[fieldName] = true;
            }
        }
        if (Object.keys(omitFields).length > 0) {
            omit[modelName] = omitFields;
        }
    }

    const db = new ZenStackClient(schema, {
        dialect: dialect,
        log: log && log.length > 0 ? log : undefined,
        omit: Object.keys(omit).length > 0 ? omit : undefined,
        skipValidationForComputedFields: true,
    }) as ClientContract<SchemaDef>;

    // check whether the database is reachable
    try {
        await db.$connect();
    } catch (err) {
        throw new CliError(`Failed to connect to the database: ${err instanceof Error ? err.message : String(err)}`);
    }

    // If a studioAuthKey is provided, create an authDb with the policy plugin
    const authDb = db.$use(new PolicyPlugin()) as ClientContract<SchemaDef>;
    if (options.studioAuthKey) {
        console.log(colors.gray('Access policy plugin enabled for authorization.'));
    }

    startServer(db, schemaModule.schema, options, authDb);

    if (!options.studioAuthKey) {
        console.warn(
            colors.yellow(
                'Warning: This proxy has no authentication. Do not expose it to the public network.\n' +
                    'To secure it, get an API key from ZenStack Studio and set it via the ZENSTACK_STUDIO_AUTH_KEY environment variable.',
            ),
        );
    }
}

function evaluateUrl(schemaUrl: ConfigExpr) {
    if (isLiteralExpr(schemaUrl)) {
        // Handle string literal
        return getStringLiteral(schemaUrl);
    } else if (isInvocationExpr(schemaUrl)) {
        const envFunction = schemaUrl as InvocationExpr;
        const envName = getStringLiteral(envFunction.args[0]?.value as LiteralExpr)!;
        const envValue = process.env[envName];
        if (!envValue) {
            throw new CliError(`Environment variable ${envName} is not set`);
        }
        return envValue;
    } else {
        throw new CliError(`Unable to resolve the "url" field value.`);
    }
}

function redactDatabaseUrl(url: string): string {
    try {
        const parsedUrl = new URL(url);
        if (parsedUrl.password) {
            parsedUrl.password = '***';
        }
        if (parsedUrl.username) {
            parsedUrl.username = '***';
        }
        return parsedUrl.toString();
    } catch {
        // If URL parsing fails, return the original
        return url;
    }
}

export async function createDialect(provider: string, databaseUrl: string, schemaFilePath: string) {
    switch (provider) {
        case 'sqlite': {
            let SQLite: typeof BetterSqlite3;
            const mod = await loadPackage('better-sqlite3');
            if (mod) {
                SQLite = mod.default || mod;
            } else {
                throw new CliError(
                    `Package "better-sqlite3" is required for SQLite support. Please install it with: npm install better-sqlite3`,
                );
            }
            let resolvedUrl = databaseUrl.trim();
            if (resolvedUrl.startsWith('file:')) {
                resolvedUrl = new URL(resolvedUrl, `file:${schemaFilePath}`).pathname;
                if (process.platform === 'win32' && resolvedUrl[0] === '/') resolvedUrl = resolvedUrl.slice(1);
            }
            console.log(colors.gray(`Connecting to SQLite database at: ${resolvedUrl}`));
            return new SqliteDialect({
                database: new SQLite(resolvedUrl),
            });
        }
        case 'postgresql': {
            let PgPool: typeof PgPoolType;
            const mod = await loadPackage('pg');
            if (mod) {
                PgPool = mod.Pool || mod.default?.Pool;
            } else {
                throw new CliError(
                    `Package "pg" is required for PostgreSQL support. Please install it with: npm install pg`,
                );
            }
            console.log(colors.gray(`Connecting to PostgreSQL database at: ${redactDatabaseUrl(databaseUrl)}`));
            return new PostgresDialect({
                pool: new PgPool({
                    connectionString: databaseUrl,
                }),
            });
        }
        case 'mysql': {
            let createMysqlPool: typeof MysqlCreatePool;
            const mod = await loadPackage('mysql2');
            if (mod) {
                createMysqlPool = mod.createPool || mod.default?.createPool;
            } else {
                throw new CliError(
                    `Package "mysql2" is required for MySQL support. Please install it with: npm install mysql2`,
                );
            }
            console.log(colors.gray(`Connecting to MySQL database at: ${redactDatabaseUrl(databaseUrl)}`));
            return new MysqlDialect({
                pool: createMysqlPool(databaseUrl),
            });
        }
        default:
            throw new CliError(`Unsupported database provider: ${provider}`);
    }
}

function startServer(
    client: ClientContract<SchemaDef>,
    schema: any,
    options: Options,
    authDb: ClientContract<SchemaDef>,
) {
    const app = createProxyApp({
        client,
        schema,
        authDb,
        auth: options.studioAuthKey
            ? {
                  studioAuthKey: options.studioAuthKey,
                  signatureToleranceSecs: options.signatureToleranceSecs,
              }
            : undefined,
    });

    const server = serve(
        {
            fetch: app.fetch,
            port: options.port,
        },
        () => {
            console.log(`ZenStack proxy server is running on port: ${options.port}`);
            console.log(`You can visit ZenStack Studio at: ${colors.blue('https://studio.zenstack.dev')}`);
        },
    );

    server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
            console.error(
                colors.red(`Port ${options.port} is already in use. Please choose a different port using -p option.`),
            );
        } else {
            throw new CliError(`Failed to start the server: ${err.message}`);
        }
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        server.close(() => {
            console.log('\nZenStack proxy server closed');
        });

        await client.$disconnect();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        server.close(() => {
            console.log('\nZenStack proxy server closed');
        });
        await client.$disconnect();
        process.exit(0);
    });
}

// ---------------------------------------------------------------------------
// --introspect helpers
// ---------------------------------------------------------------------------

export async function resolveSchema(options: Options): Promise<string> {
    if (!options.introspect) {
        try {
            return getSchemaFile(options.schema);
        } catch (err) {
            if (!(err instanceof CliError)) throw err;

            // Provide a helpful error depending on whether DATABASE_URL is set
            const hasEnvUrl = !!process.env['DATABASE_URL'];
            const dbFlag = hasEnvUrl ? '' : '-d <databaseUrl>';

            throw new CliError(
                'No ZModel schema file found in default locations.\n' +
                    `  • If you have an existing schema file, specify it explicitly:\n    npx @zenstackhq/cli studio --schema <path> ${dbFlag}\n` +
                    `  • Otherwise, auto-generate from the database:\n    npx @zenstackhq/cli studio --introspect ${dbFlag}`,
            );
        }
    } else {
        // Resolve database URL
        const databaseUrl = options.databaseUrl ?? process.env['DATABASE_URL'];
        if (!databaseUrl) {
            throw new CliError('--introspect requires a database connection — pass -d <url> or set DATABASE_URL.');
        }

        // Determine DB provider type from URL
        const providerType = getProviderFromUrl(databaseUrl);

        // Install required packages
        await installDbDriverPackage(providerType);

        // Introspect and generate schema
        const urlFromEnv = !options.databaseUrl;
        const schemaFile = await introspectAndGenerateSchema(databaseUrl, providerType, urlFromEnv);

        // Run code generation from the generated schema
        await runGenerate({ schema: schemaFile, silent: false, watch: false });

        console.log(
            colors.yellow(
                '\n⚠  The generated schema has no access policies.\n' +
                    '   All data is accessible without restriction.\n' +
                    '   Edit ' +
                    colors.cyan(schemaFile) +
                    ' to add access policies.\n',
            ),
        );

        return schemaFile;
    }
}

export function getProviderFromUrl(url: string): DataSourceProviderType {
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        return 'postgresql';
    }
    if (url.startsWith('mysql://')) {
        return 'mysql';
    }
    if (url.startsWith('file:') || url.startsWith('sqlite:')) {
        return 'sqlite';
    }
    throw new CliError(`Unable to determine database type from URL: ${url}`);
}

export async function installDbDriverPackage(providerType: DataSourceProviderType) {
    // Add the appropriate DB driver
    const driverPackage: { name: string; dev: false } = (() => {
        switch (providerType) {
            case 'postgresql':
                return { name: 'pg', dev: false as const };
            case 'mysql':
                return { name: 'mysql2', dev: false as const };
            case 'sqlite':
                return { name: 'better-sqlite3', dev: false as const };
        }
    })();

    if (isPackageInstalled(driverPackage.name)) {
        return;
    }

    let pm = await detect();
    if (!pm) {
        pm = { agent: 'npm', name: 'npm' };
    }

    console.log(colors.gray(`Using package manager: ${pm.agent}`));

    const resolved = resolveCommand(pm.agent, 'add', [
        driverPackage.name,
        ...(driverPackage.dev ? [pm.agent.startsWith('yarn') || pm.agent === 'bun' ? '--dev' : '--save-dev'] : []),
    ]);
    if (!resolved) {
        throw new CliError(
            `Unable to determine how to install package "${driverPackage.name}". Please install it manually.`,
        );
    }

    const spinner = ora(`Installing "${driverPackage.name}"`).start();
    try {
        execSync(`${resolved.command} ${resolved.args.join(' ')}`, {
            cwd: process.cwd(),
        });
        spinner.succeed();
    } catch (e) {
        spinner.fail();
        throw e;
    }
}

function adjustSqliteUrlForSchema(url: string): { isRelative: boolean; adjustedUrl: string } {
    let prefix = '';
    let filePath = url;

    if (url.startsWith('file:')) {
        prefix = 'file:';
        filePath = url.substring('file:'.length);
    } else if (url.startsWith('sqlite:')) {
        prefix = 'sqlite:';
        filePath = url.substring('sqlite:'.length);
    }

    if (!path.isAbsolute(filePath)) {
        const adjustedPath = path.join('..', filePath).replace(/\\/g, '/');
        return {
            isRelative: true,
            adjustedUrl: `${prefix}${adjustedPath}`,
        };
    }

    return {
        isRelative: false,
        adjustedUrl: url,
    };
}

async function introspectAndGenerateSchema(
    databaseUrl: string,
    providerType: DataSourceProviderType,
    urlFromEnv: boolean,
): Promise<string> {
    // Write a minimal datasource-only schema so runPull has something to load
    let urlExpr: string;
    if (providerType === 'sqlite') {
        const { isRelative, adjustedUrl } = adjustSqliteUrlForSchema(databaseUrl);
        if (isRelative) {
            urlExpr = `'${adjustedUrl}'`;
            databaseUrl = adjustedUrl; // Update databaseUrl to the adjusted relative path for runPull
        } else {
            urlExpr = urlFromEnv ? 'env("DATABASE_URL")' : `'${databaseUrl}'`;
        }
    } else {
        urlExpr = urlFromEnv ? 'env("DATABASE_URL")' : `'${databaseUrl}'`;
    }

    const minimalSchema = `datasource db {\n    provider = '${providerType}'\n    url = ${urlExpr}\n}\n`;

    const schemaDir = path.resolve('zenstack');
    const schemaFile = path.join(schemaDir, 'schema.zmodel');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(schemaFile, minimalSchema, 'utf-8');

    // Delegate to runPull with provider/URL overrides
    await runPull({
        schema: schemaFile,
        output: schemaFile,
        databaseUrl,
        provider: providerType,
        modelCasing: 'pascal',
        fieldCasing: 'none',
        alwaysMap: false,
        quote: 'single',
        indent: 4,
    });

    console.log(colors.green(`\n✅ Schema generated: ${colors.cyan(schemaFile)}`));

    return schemaFile;
}
