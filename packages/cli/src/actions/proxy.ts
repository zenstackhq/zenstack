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
import { RPCApiHandler } from '@zenstackhq/server/api';
import { ZenStackMiddleware } from '@zenstackhq/server/express';
import type BetterSqlite3 from 'better-sqlite3';
import colors from 'colors';
import cors from 'cors';
import express from 'express';
import { createJiti } from 'jiti';
import type { createPool as MysqlCreatePool } from 'mysql2';
import { verify } from 'node:crypto';
import path from 'node:path';
import type { Pool as PgPoolType } from 'pg';
import { CliError } from '../cli-error';
import { getVersion } from '../utils/version-utils';
import { getOutputPath, getSchemaFile, loadSchemaDocument } from './action-utils';

type Options = {
    output?: string;
    schema?: string;
    port?: number;
    logLevel?: string[];
    databaseUrl?: string;
    publicAPIKey?: string;
    signatureToleranceSecs?: number;
};

/**
 * Represents the identity claim embedded in the Authorization header.
 * The bearer token is a plain base64-encoded JSON string.
 */
type UserClaim = { type: 'superUser' } | { type: 'user'; data: Record<string, unknown> };

export async function run(options: Options) {
    const allowedLogLevels = ['error', 'query'] as const;
    const log = options.logLevel?.filter((level): level is (typeof allowedLogLevels)[number] =>
        allowedLogLevels.includes(level as any),
    );
    const schemaFile = getSchemaFile(options.schema);
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
    });

    // check whether the database is reachable
    try {
        await db.$connect();
    } catch (err) {
        throw new CliError(`Failed to connect to the database: ${err instanceof Error ? err.message : String(err)}`);
    }

    // If a publicAPIKey is provided, create an authDb with the policy plugin
    let authDb: ClientContract<SchemaDef> | undefined;
    if (options.publicAPIKey) {
        authDb = db.$use(new PolicyPlugin()) as ClientContract<SchemaDef>;
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
    options?: {
        publicAPIKey?: string;
        authDb?: ClientContract<SchemaDef>;
        /** Seconds within which a signed request is considered valid. Defaults to 60. */
        signatureToleranceSecs?: number;
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

    if (options?.publicAPIKey) {
        // Apply signature-verification middleware to all authenticated endpoints.
        const toleranceSecs = options.signatureToleranceSecs ?? 60;
        app.use(['/api/model', '/api/schema'], createSignatureMiddleware(options.publicAPIKey, toleranceSecs));
    }

    app.use(
        '/api/model',
        ZenStackMiddleware({
            apiHandler: new RPCApiHandler({ schema }),
            getClient: (req) => resolveClient(client, options?.authDb, req),
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
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const signatureHeader = req.headers['x-zenstack-signature'];
        if (!signatureHeader || typeof signatureHeader !== 'string') {
            return res.status(401).json({ message: 'Missing x-zenstack-signature header' });
        }

        const parts = signatureHeader.split(',');
        const timestampPart = parts.find((p) => p.startsWith('t='));
        const sigPart = parts.find((p) => p.startsWith('v1='));
        if (!timestampPart || !sigPart) {
            return res.status(401).json({ message: 'Invalid x-zenstack-signature format' });
        }
        const timestamp = timestampPart.substring(2);
        const sig = sigPart.substring(3);

        // Replay-attack prevention: reject requests whose timestamp deviates
        // from server time by more than the configured tolerance.
        const requestTime = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (isNaN(requestTime) || Math.abs(now - requestTime) > toleranceSeconds) {
            return res.status(401).json({ message: 'Request timestamp is expired or invalid' });
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
                return res.status(401).json({ message: 'Invalid signature' });
            }
        } catch {
            return res.status(401).json({ message: 'Invalid signature' });
        }

        return next();
    };
}

/**
 * Resolves the appropriate client for a request based on the Authorization header.
 *
 * - No publicAPIKey configured (authDb is undefined): always return the base client.
 * - SuperUser claim: return the base client (full access, no policy enforcement).
 * - Regular user claim: return authDb with the user identity set via $setAuth.
 * - No / invalid token: return the base client.
 */
function resolveClient(
    client: ClientContract<SchemaDef>,
    authDb: ClientContract<SchemaDef> | undefined,
    req: express.Request,
): ClientContract<SchemaDef> {
    if (!authDb) {
        return client;
    }

    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        return client;
    }

    const token = authHeader.substring(7);
    let claim: UserClaim;
    try {
        claim = JSON.parse(Buffer.from(token, 'base64').toString('utf8')) as UserClaim;
    } catch {
        return client;
    }

    if (claim.type === 'superUser') {
        return client;
    }

    if (claim.type === 'user') {
        return authDb.$setAuth(claim.data) as ClientContract<SchemaDef>;
    }

    return client;
}

function startServer(
    client: ClientContract<SchemaDef>,
    schema: any,
    options: Options,
    authDb?: ClientContract<SchemaDef>,
) {
    const app = createProxyApp(client, schema, {
        publicAPIKey: options.publicAPIKey,
        authDb,
        signatureToleranceSecs: options.signatureToleranceSecs,
    });

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
