import { ConfigExpr, InvocationExpr, isDataSource, isInvocationExpr, isLiteralExpr, LiteralExpr, type Model } from '@zenstackhq/language/ast';
import { getStringLiteral } from '@zenstackhq/language/utils';
import { MigrationEngine, type RenameResolver } from '@zenstackhq/migration';
import type { DataSourceProviderType, SchemaDef } from '@zenstackhq/schema';
import { createJiti } from 'jiti';
import path from 'node:path';
import { CliError } from '../cli-error';
import { logWarning } from '../utils/log';
import { getOutputPath, getSchemaFile, loadSchemaDocument } from './action-utils';
import { run as generate } from './generate';

export interface PreparedEngine {
    engine: MigrationEngine;
    schema: SchemaDef;
    outputPath: string;
    provider: DataSourceProviderType;
    url: string;
    jiti: ReturnType<typeof createJiti>;
}

/**
 * Whether to use the native migration engine: true if `--native` was passed, or if the
 * `ZENSTACK_NATIVE_MIGRATE` environment variable is set to `1`, `true`, or `yes`.
 */
export function isNativeEnabled(explicit?: boolean): boolean {
    if (explicit) {
        return true;
    }
    const env = (process.env['ZENSTACK_NATIVE_MIGRATE'] ?? '').trim().toLowerCase();
    return env === '1' || env === 'true' || env === 'yes';
}

/** Prints a preview/caution banner shown whenever the native migration engine is activated. */
export function printNativeBanner(): void {
    logWarning(
        [
            '',
            '┌─────────────────────────────────────────────────────────────────────┐',
            '│  ⚠  ZenStack native migration engine — PREVIEW                       │',
            '│                                                                     │',
            '│  This engine is experimental and under active development. Always   │',
            '│  review generated migrations and back up your data. Do not rely on  │',
            '│  it for production databases yet.                                    │',
            '└─────────────────────────────────────────────────────────────────────┘',
            '',
        ].join('\n'),
    );
}

/**
 * Compiles the ZModel, loads the runtime schema, resolves the datasource, and constructs a
 * {@link MigrationEngine} — shared by the `migrate` and `db push` actions.
 */
export async function prepareEngine(options: {
    schema?: string;
    migrations?: string;
    output?: string;
    /** Optional rename resolver used when authoring migrations (see `migrate dev`). */
    resolver?: RenameResolver;
}): Promise<PreparedEngine> {
    const schemaFile = getSchemaFile(options.schema);
    let outputPath = getOutputPath(options, schemaFile);
    if (!path.isAbsolute(outputPath)) {
        outputPath = path.resolve(process.cwd(), outputPath);
    }

    const model = await loadSchemaDocument(schemaFile);
    const { provider, url } = resolveDatasource(model);

    const migrationsDir = options.migrations
        ? path.resolve(process.cwd(), options.migrations)
        : path.join(outputPath, 'migrations');

    const fileUrl = typeof __filename !== 'undefined' ? __filename : import.meta.url;
    const jiti = createJiti(fileUrl);

    // compile the ZModel to `schema.ts`, then load the runtime SchemaDef
    await generate({ schema: options.schema, output: options.output, silent: true, watch: false, tips: false });
    const schemaModule = (await jiti.import(path.join(outputPath, 'schema'))) as { schema: SchemaDef };
    const schema = schemaModule.schema;

    const engine = new MigrationEngine({
        schema,
        connectionUrl: url,
        migrationsDir,
        baseDir: outputPath,
        importer: { import: (id: string) => jiti.import(id) },
        resolver: options.resolver,
    });

    return { engine, schema, outputPath, provider, url, jiti };
}

function resolveDatasource(model: Model): { provider: DataSourceProviderType; url: string } {
    const dataSource = model.declarations.find(isDataSource);
    if (!dataSource) {
        throw new CliError('No "datasource" found in the schema.');
    }

    const providerLiteral = getStringLiteral(dataSource.fields.find((f) => f.name === 'provider')?.value);
    if (!providerLiteral) {
        throw new CliError('The schema\'s "datasource" does not have a valid "provider".');
    }
    if (providerLiteral !== 'sqlite' && providerLiteral !== 'postgresql' && providerLiteral !== 'mysql') {
        throw new CliError(`Unsupported database provider: ${providerLiteral}`);
    }

    const urlExpr = dataSource.fields.find((f) => f.name === 'url')?.value;
    if (!urlExpr) {
        throw new CliError('The schema\'s "datasource" does not have a "url" field.');
    }

    return { provider: providerLiteral, url: evaluateUrl(urlExpr) };
}

function evaluateUrl(expr: ConfigExpr): string {
    if (isLiteralExpr(expr)) {
        return getStringLiteral(expr)!;
    }
    if (isInvocationExpr(expr)) {
        const envFunction = expr as InvocationExpr;
        const envName = getStringLiteral(envFunction.args[0]?.value as LiteralExpr)!;
        const envValue = process.env[envName];
        if (!envValue) {
            throw new CliError(`Environment variable ${envName} is not set`);
        }
        return envValue;
    }
    throw new CliError('Unable to resolve the datasource "url" field value.');
}
