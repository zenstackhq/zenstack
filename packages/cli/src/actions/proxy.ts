import { formatDocument, ZModelCodeGenerator } from '@zenstackhq/language';
import {
    ConfigExpr,
    InvocationExpr,
    isDataSource,
    isInvocationExpr,
    isLiteralExpr,
    LiteralExpr,
    type Model,
} from '@zenstackhq/language/ast';
import { getStringLiteral } from '@zenstackhq/language/utils';
import { ZenStackClient, type ClientContract } from '@zenstackhq/orm';
import { MysqlDialect } from '@zenstackhq/orm/dialects/mysql';
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres';
import { SqliteDialect } from '@zenstackhq/orm/dialects/sqlite';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { RPCApiHandler } from '@zenstackhq/server/api';
import { ZenStackMiddleware } from '@zenstackhq/server/express';
import type BetterSqlite3 from 'better-sqlite3';
import colors from 'colors';
import cors from 'cors';
import express from 'express';
import { createJiti } from 'jiti';
import type { createPool as MysqlCreatePool } from 'mysql2';
import { verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { detect, resolveCommand } from 'package-manager-detector';
import type { Pool as PgPoolType } from 'pg';
import { CliError } from '../cli-error';
import { execSync } from '../utils/exec-utils';
import { getVersion } from '../utils/version-utils';
import { getOutputPath, getSchemaFile, loadSchemaDocument } from './action-utils';
import type { DataSourceProviderType } from '@zenstackhq/schema';
import { providers as pullProviders, type IntrospectionProvider } from './pull/provider';
import { syncEnums, syncRelation, syncTable, type Relation } from './pull';
import { z } from 'zod';

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

export const ProxyAuthError = {
    MISSING_SIGNATURE_HEADER: 'Missing x-zenstack-signature header',
    INVALID_TIMESTAMP: 'Request timestamp is expired or invalid',
    INVALID_SIGNATURE_FORMAT: 'Invalid x-zenstack-signature format',
} as const;

type ProxyAuthErrorCode = keyof typeof ProxyAuthError;

function rejectAuth(res: express.Response, code: ProxyAuthErrorCode) {
    return res.status(401).json({ code, message: ProxyAuthError[code] });
}
/**
 * Represents the identity claim embedded in the Authorization header.
 * The bearer token is a plain base64-encoded JSON string.
 */
const UserClaimSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('superUser') }),
    z.object({ type: z.literal('user'), data: z.record(z.string(), z.unknown()) }),
]);

type UserClaim = z.infer<typeof UserClaimSchema>;

/**
 * Accepts a public key in either PEM format or as a raw base64 / base64url DER string
 * (without the `-----BEGIN PUBLIC KEY-----` markers) and always returns a PEM string.
 */
function normalizePublicKey(key: string): string {
    key = key.trim();
    if (key.startsWith('-----BEGIN PUBLIC KEY-----')) {
        return key;
    }
    // Convert base64url → standard base64, then wrap in PEM markers.
    const b64 = key.replace(/-/g, '+').replace(/_/g, '/');
    return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
}

export async function run(options: Options) {
    // Resolve public key: CLI arg takes precedence, then ZENSTACK_STUDIO_AUTH_KEY env var.
    options = { ...options, studioAuthKey: options.studioAuthKey ?? process.env['ZENSTACK_STUDIO_AUTH_KEY'] };
    if (!options.studioAuthKey) {
        console.warn(
            colors.yellow(
                'Warning: This proxy has no authentication. Do not expose it to the public network.\n' +
                    'To secure it, get an API key from ZenStack Studio and set it via the ZENSTACK_STUDIO_AUTH_KEY environment variable.',
            ),
        );
    }

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

    const dialect = await createDialect(provider, databaseUrl!, outputPath);

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

async function createDialect(provider: string, databaseUrl: string, outputPath: string) {
    switch (provider) {
        case 'sqlite': {
            let SQLite: typeof BetterSqlite3;
            try {
                SQLite = (await import('better-sqlite3')).default;
            } catch {
                throw new CliError(
                    `Package "better-sqlite3" is required for SQLite support. Please install it with: npm install better-sqlite3`,
                );
            }
            let resolvedUrl = databaseUrl.trim();
            if (resolvedUrl.startsWith('file:')) {
                const filePath = resolvedUrl.substring('file:'.length);
                if (!path.isAbsolute(filePath)) {
                    resolvedUrl = path.join(outputPath, filePath);
                }
            }
            console.log(colors.gray(`Connecting to SQLite database at: ${resolvedUrl}`));
            return new SqliteDialect({
                database: new SQLite(resolvedUrl),
            });
        }
        case 'postgresql': {
            let PgPool: typeof PgPoolType;
            try {
                PgPool = (await import('pg')).Pool;
            } catch {
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
            try {
                createMysqlPool = (await import('mysql2')).createPool;
            } catch {
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

export function createProxyApp(
    client: ClientContract<SchemaDef>,
    schema: SchemaDef,
    authDb: ClientContract<SchemaDef>,
    auth?: {
        studioAuthKey: string;
        /** Seconds within which a signed request is considered valid. Defaults to 60. */
        signatureToleranceSecs: number;
    },
): express.Application {
    const app = express();
    app.use(cors());
    app.use(
        express.json({
            limit: '5mb',
            verify: (req, _res, buf) => {
                // Capture the raw body string for use in signature verification.
                (req as express.Request & { rawBody?: string }).rawBody = buf.toString('utf8');
            },
        }),
    );
    app.use(express.urlencoded({ extended: true, limit: '5mb' }));

    if (auth?.studioAuthKey) {
        // Apply signature-verification middleware to all authenticated endpoints.
        const toleranceSecs = auth.signatureToleranceSecs;
        const normalizedKey = normalizePublicKey(auth.studioAuthKey);
        app.use(['/api/model', '/api/schema'], createSignatureMiddleware(normalizedKey, toleranceSecs));
    }

    app.use(
        '/api/model',
        ZenStackMiddleware({
            apiHandler: new RPCApiHandler({ schema }),
            getClient: (req) => resolveClient(client, authDb, req, !!auth?.studioAuthKey),
        }),
    );

    app.get('/api/schema', (_req, res: express.Response) => {
        res.json({ ...schema, zenstackVersion: getVersion() });
    });

    return app;
}

/**
 * Creates an Express middleware that verifies the ed25519 signature on every request.
 *
 * The signature header format is: `t=<unix-timestamp>,v1=<base64url-signature>`
 *
 * The signed message is constructed as:
 *   - GET requests:  `<raw-query-string><timestamp>[<authorizationToken>]`
 *   - Other methods: `<raw-body><timestamp>[<authorizationToken>]`
 *
 * `authorizationToken` is the bearer token value from the `Authorization` header (if present).
 */
function createSignatureMiddleware(publicKey: string, toleranceSeconds: number) {
    // Throttle invalid-signature warnings to at most once per 60 seconds.
    let lastInvalidSigWarnAt = 0;
    const WARN_THROTTLE_SECS = 60;

    function warnInvalidSignature() {
        const now = Math.floor(Date.now() / 1000);
        if (now - lastInvalidSigWarnAt >= WARN_THROTTLE_SECS) {
            lastInvalidSigWarnAt = now;
            console.warn(
                colors.yellow(
                    'Warning: Received a request with an invalid signature. ' +
                        'Please double-check whether you have the correct public API key configured.',
                ),
            );
        }
    }

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const signatureHeader = req.headers['x-zenstack-signature'];
        if (!signatureHeader || typeof signatureHeader !== 'string') {
            return rejectAuth(res, 'MISSING_SIGNATURE_HEADER');
        }

        const parts = signatureHeader.split(',');
        const timestampPart = parts.find((p) => p.startsWith('t='));
        const sigPart = parts.find((p) => p.startsWith('v1='));
        if (!timestampPart || !sigPart) {
            return rejectAuth(res, 'INVALID_SIGNATURE_FORMAT');
        }
        const timestamp = timestampPart.substring(2);
        const sig = sigPart.substring(3);

        // Replay-attack prevention: reject requests whose timestamp deviates
        // from server time by more than the configured tolerance.
        const requestTime = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (isNaN(requestTime) || Math.abs(now - requestTime) > toleranceSeconds) {
            return rejectAuth(res, 'INVALID_TIMESTAMP');
        }

        // Payload: raw query string for GET/DELETE, raw body for other methods.
        let payload: string;
        if (req.method === 'GET' || req.method === 'DELETE') {
            const qMark = req.originalUrl.indexOf('?');
            payload = qMark >= 0 ? req.originalUrl.substring(qMark + 1) : '';
        } else {
            payload = (req as express.Request & { rawBody?: string }).rawBody ?? '';
        }

        // authorizationToken is the bearer token value (if present).
        const authHeader = req.headers['authorization'];
        const authorizationToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

        const message = authorizationToken ? `${payload}${timestamp}${authorizationToken}` : `${payload}${timestamp}`;

        try {
            const isValid = verify(null, Buffer.from(message, 'utf8'), publicKey, Buffer.from(sig, 'base64url'));
            if (!isValid) {
                warnInvalidSignature();
                return rejectAuth(res, 'INVALID_SIGNATURE_FORMAT');
            }
        } catch {
            warnInvalidSignature();
            return rejectAuth(res, 'INVALID_SIGNATURE_FORMAT');
        }

        return next();
    };
}

/**
 * Resolves the appropriate client for a request based on the Authorization header.
 *
 * - No studioAuthKey configured (authDb is undefined): always return the base client.
 * - SuperUser claim: return the base client (full access, no policy enforcement).
 * - Regular user claim: return authDb with the user identity set via $setAuth.
 * - No / invalid token: return the base client.
 */
function resolveClient(
    client: ClientContract<SchemaDef>,
    authDb: ClientContract<SchemaDef>,
    req: express.Request,
    isAuthKeyEnabled: boolean,
): ClientContract<SchemaDef> {
    const authHeader = req.headers['authorization'];

    // If AuthKey is not enabled, and Authorization header is not present, then it is the basic access without auth.
    if (!isAuthKeyEnabled && !authHeader) {
        return client;
    }

    if (!authHeader?.startsWith('Bearer ')) {
        return authDb;
    }

    const token = authHeader.substring(7);
    let claim: UserClaim;
    try {
        claim = UserClaimSchema.parse(JSON.parse(Buffer.from(token, 'base64').toString('utf8')));
    } catch (err) {
        console.error(
            colors.red(`Failed to parse user claim from token: ${err instanceof Error ? err.message : String(err)}`),
        );
        return authDb;
    }

    if (claim.type === 'superUser') {
        // SuperUser has full access without policy enforcement, so we return the base client directly.
        return client;
    } else {
        return authDb.$setAuth(claim.data) as ClientContract<SchemaDef>;
    }
}

function startServer(
    client: ClientContract<SchemaDef>,
    schema: any,
    options: Options,
    authDb: ClientContract<SchemaDef>,
) {
    const app = createProxyApp(
        client,
        schema,
        authDb,
        options.studioAuthKey
            ? {
                  studioAuthKey: options.studioAuthKey,
                  signatureToleranceSecs: options.signatureToleranceSecs,
              }
            : undefined,
    );

    const server = app.listen(options.port, () => {
        console.log(`ZenStack proxy server is running on port: ${options.port}`);
        console.log(`You can visit ZenStack Studio at: ${colors.blue('https://studio.zenstack.dev')}`);
    });

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

async function resolveSchema(options: Options): Promise<string> {
    try {
        return getSchemaFile(options.schema);
    } catch (err) {
        if (!(err instanceof CliError)) throw err;

        // Schema not found – check whether we should introspect
        if (!options.introspect) {
            // Provide a helpful error depending on whether DATABASE_URL is set
            const hasEnvUrl = !!process.env['DATABASE_URL'];
            if (hasEnvUrl) {
                throw new CliError(
                    'No schema file found. You can either:\n' +
                        '  • Specify the schema explicitly:  zen studio --schema <path>\n' +
                        '  • Auto-generate from the database: zen studio --introspect',
                );
            } else {
                throw new CliError(
                    'No schema file found. You can either:\n' +
                        '  • Specify the schema explicitly:  zen studio --schema <path> -d <url>\n' +
                        '  • Auto-generate from the database: zen studio --introspect -d <url>',
                );
            }
        }

        // Resolve database URL
        const databaseUrl = options.databaseUrl ?? process.env['DATABASE_URL'];
        if (!databaseUrl) {
            throw new CliError(
                '--introspect requires a database connection — pass -d <url> or set DATABASE_URL.',
            );
        }

        // If the default schema file already exists, skip introspection
        const defaultSchemaPath = path.resolve('zenstack', 'schema.zmodel');
        if (fs.existsSync(defaultSchemaPath)) {
            console.log(
                colors.gray(
                    'Note: --introspect ignored because a schema file already exists at ' +
                        defaultSchemaPath,
                ),
            );
            return defaultSchemaPath;
        }

        // Determine DB provider type from URL
        const providerType = getProviderFromUrl(databaseUrl);

        // Install required packages
        await installPackagesForIntrospect(providerType);

        // Introspect and generate schema
        const urlFromEnv = !options.databaseUrl;
        const schemaFile = await introspectAndGenerateSchema(
            databaseUrl,
            providerType,
            urlFromEnv,
        );

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

function getProviderFromUrl(url: string): DataSourceProviderType {
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

async function installPackagesForIntrospect(providerType: DataSourceProviderType) {
    const corePackages = [
        { name: '@zenstackhq/cli@latest', dev: true },
        { name: '@zenstackhq/schema@latest', dev: false },
        { name: '@zenstackhq/orm@latest', dev: false },
    ];

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

    const allPackages = [...corePackages, driverPackage];

    let pm = await detect();
    if (!pm) {
        pm = { agent: 'npm', name: 'npm' };
    }

    console.log(colors.gray(`Using package manager: ${pm.agent}`));

    for (const pkg of allPackages) {
        const resolved = resolveCommand(pm.agent, 'add', [
            pkg.name,
            ...(pkg.dev
                ? [pm.agent.startsWith('yarn') || pm.agent === 'bun' ? '--dev' : '--save-dev']
                : []),
        ]);
        if (!resolved) {
            throw new CliError(
                `Unable to determine how to install package "${pkg.name}". Please install it manually.`,
            );
        }

        const spinner = ora(`Installing "${pkg.name}"`).start();
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
}

async function introspectAndGenerateSchema(
    databaseUrl: string,
    providerType: DataSourceProviderType,
    urlFromEnv: boolean,
): Promise<string> {
    const provider: IntrospectionProvider = pullProviders[providerType];
    if (!provider) {
        throw new CliError(`No introspection provider found for: ${providerType}`);
    }

    // Build a minimal datasource-only schema so we can bootstrap Langium services
    const urlExpr = urlFromEnv ? 'env("DATABASE_URL")' : `'${databaseUrl}'`;
    const minimalSchema = `datasource db {\n    provider = '${providerType}'\n    url = ${urlExpr}\n}\n`;

    // Write the minimal schema to disk first, then load it so Langium has a proper document URI
    const schemaDir = path.resolve('zenstack');
    const schemaFile = path.join(schemaDir, 'schema.zmodel');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(schemaFile, minimalSchema, 'utf-8');

    // Load the minimal schema to get services
    const { model, services } = await loadSchemaDocument(schemaFile, { returnServices: true });

    // Introspect the database
    const spinner = ora('Introspecting database...').start();
    let introspectionResult;
    try {
        introspectionResult = await provider.introspect(databaseUrl, {
            schemas: ['public'],
            modelCasing: 'pascal',
        });
        spinner.succeed('Database introspected successfully.');
    } catch (err) {
        spinner.fail('Failed to introspect database.');
        throw err;
    }

    // Build a fresh AST Model with the datasource already in it from loadSchemaDocument
    const newModel: Model = {
        $type: 'Model',
        $container: undefined,
        $containerProperty: undefined,
        $containerIndex: undefined,
        declarations: [...model.declarations.filter((d) => d.$type === 'DataSource')],
        imports: [],
    };

    // Sync enums
    syncEnums({
        dbEnums: introspectionResult.enums,
        model: newModel,
        oldModel: model,
        provider,
        services,
        options: { schema: schemaFile, modelCasing: 'pascal', fieldCasing: 'none', alwaysMap: false, quote: 'single', indent: 4 },
        defaultSchema: 'public',
    });

    // Sync tables and collect relations
    const resolvedRelations: Relation[] = [];
    for (const table of introspectionResult.tables) {
        const relations = syncTable({
            table,
            model: newModel,
            oldModel: model,
            provider,
            services,
            options: { schema: schemaFile, modelCasing: 'pascal', fieldCasing: 'none', alwaysMap: false, quote: 'single', indent: 4 },
            defaultSchema: 'public',
        });
        resolvedRelations.push(...relations);
    }

    // Normalize schema values for relation matching
    const schemasMatch = (a: string | null | undefined, b: string | null | undefined) =>
        (a ?? '') === (b ?? '');

    // Sync relations
    for (const relation of resolvedRelations) {
        const similarRelations = resolvedRelations.filter((rr) => {
            return (
                rr !== relation &&
                ((schemasMatch(rr.schema, relation.schema) &&
                    rr.table === relation.table &&
                    schemasMatch(rr.references.schema, relation.references.schema) &&
                    rr.references.table === relation.references.table) ||
                    (schemasMatch(rr.schema, relation.references.schema) &&
                        rr.table === relation.references.table &&
                        schemasMatch(rr.references.schema, relation.schema) &&
                        rr.references.table === relation.table))
            );
        }).length;
        const selfRelation =
            schemasMatch(relation.references.schema, relation.schema) &&
            relation.references.table === relation.table;
        syncRelation({
            model: newModel,
            relation,
            services,
            options: { schema: schemaFile, modelCasing: 'pascal', fieldCasing: 'none', alwaysMap: false, quote: 'single', indent: 4 },
            selfRelation,
            similarRelations,
        });
    }

    // Generate zmodel text
    const generator = new ZModelCodeGenerator({ quote: 'single', indent: 4 });
    const generatedCode = generator.generate(newModel);
    const formatted = await formatDocument(generatedCode);

    // Write the final schema
    fs.writeFileSync(schemaFile, formatted, 'utf-8');
    console.log(colors.green(`\n✅ Schema generated: ${colors.cyan(schemaFile)}`));

    return schemaFile;
}
