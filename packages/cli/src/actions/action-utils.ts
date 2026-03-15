import { invariant } from '@zenstackhq/common-helpers';
import { type ZModelServices, loadDocument } from '@zenstackhq/language';
import { type Model, type Plugin, isDataSource, type LiteralExpr } from '@zenstackhq/language/ast';
import { type CliPlugin, PrismaSchemaGenerator } from '@zenstackhq/sdk';
import colors from 'colors';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import terminalLink from 'terminal-link';
import { z } from 'zod';
import { CliError } from '../cli-error';

export function getSchemaFile(file?: string) {
    if (file) {
        if (!fs.existsSync(file)) {
            throw new CliError(`Schema file not found: ${file}`);
        }
        return file;
    }

    const pkgJsonConfig = getPkgJsonConfig(process.cwd());
    if (pkgJsonConfig.schema) {
        if (!fs.existsSync(pkgJsonConfig.schema)) {
            throw new CliError(`Schema file not found: ${pkgJsonConfig.schema}`);
        }
        if (fs.statSync(pkgJsonConfig.schema).isDirectory()) {
            const schemaPath = path.join(pkgJsonConfig.schema, 'schema.zmodel');
            if (!fs.existsSync(schemaPath)) {
                throw new CliError(`Schema file not found: ${schemaPath}`);
            }
            return schemaPath;
        } else {
            return pkgJsonConfig.schema;
        }
    }

    if (fs.existsSync('./schema.zmodel')) {
        return './schema.zmodel';
    } else if (fs.existsSync('./zenstack/schema.zmodel')) {
        return './zenstack/schema.zmodel';
    } else {
        throw new CliError(
            'Schema file not found in default locations ("./schema.zmodel" or "./zenstack/schema.zmodel").',
        );
    }
}

export async function loadSchemaDocument(
    schemaFile: string,
    opts?: { mergeImports?: boolean; returnServices?: false },
): Promise<Model>;
export async function loadSchemaDocument(
    schemaFile: string,
    opts: { returnServices: true; mergeImports?: boolean },
): Promise<{ model: Model; services: ZModelServices }>;
export async function loadSchemaDocument(
    schemaFile: string,
    opts: { returnServices?: boolean; mergeImports?: boolean } = {},
) {
    const returnServices = opts.returnServices ?? false;
    const mergeImports = opts.mergeImports ?? true;

    const loadResult = await loadDocument(schemaFile, [], mergeImports);
    if (!loadResult.success) {
        loadResult.errors.forEach((err) => {
            console.error(colors.red(err));
        });
        throw new CliError('Schema contains errors. See above for details.');
    }
    loadResult.warnings.forEach((warn) => {
        console.warn(colors.yellow(warn));
    });

    if (returnServices) return { model: loadResult.model, services: loadResult.services };

    return loadResult.model;
}

export function handleSubProcessError(err: unknown) {
    if (err instanceof Error && 'status' in err && typeof err.status === 'number') {
        process.exit(err.status);
    } else {
        process.exit(1);
    }
}

export async function generateTempPrismaSchema(zmodelPath: string, folder?: string) {
    const model = await loadSchemaDocument(zmodelPath);
    if (!model.declarations.some(isDataSource)) {
        throw new CliError('Schema must define a datasource');
    }
    const prismaSchema = await new PrismaSchemaGenerator(model).generate();
    if (!folder) {
        folder = path.dirname(zmodelPath);
    }
    const prismaSchemaFile = path.resolve(folder, '~schema.prisma');
    fs.writeFileSync(prismaSchemaFile, prismaSchema);
    return prismaSchemaFile;
}

export function getPkgJsonConfig(startPath: string) {
    const result: { schema: string | undefined; output: string | undefined; seed: string | undefined } = {
        schema: undefined,
        output: undefined,
        seed: undefined,
    };
    const pkgJsonFile = findUp(['package.json'], startPath, false);

    if (!pkgJsonFile) {
        return result;
    }

    let pkgJson: any = undefined;
    try {
        pkgJson = JSON.parse(fs.readFileSync(pkgJsonFile, 'utf8'));
    } catch {
        return result;
    }

    if (pkgJson.zenstack && typeof pkgJson.zenstack === 'object') {
        result.schema =
            pkgJson.zenstack.schema && typeof pkgJson.zenstack.schema === 'string'
                ? path.resolve(path.dirname(pkgJsonFile), pkgJson.zenstack.schema)
                : undefined;
        result.output =
            pkgJson.zenstack.output && typeof pkgJson.zenstack.output === 'string'
                ? path.resolve(path.dirname(pkgJsonFile), pkgJson.zenstack.output)
                : undefined;
        result.seed =
            typeof pkgJson.zenstack.seed === 'string' && pkgJson.zenstack.seed ? pkgJson.zenstack.seed : undefined;
    }

    return result;
}

type FindUpResult<Multiple extends boolean> = Multiple extends true ? string[] | undefined : string | undefined;

function findUp<Multiple extends boolean = false>(
    names: string[],
    cwd: string = process.cwd(),
    multiple: Multiple = false as Multiple,
    result: string[] = [],
): FindUpResult<Multiple> {
    if (!names.some((name) => !!name)) {
        return undefined;
    }
    const target = names.find((name) => fs.existsSync(path.join(cwd, name)));
    if (multiple === false && target) {
        return path.resolve(cwd, target) as FindUpResult<Multiple>;
    }
    if (target) {
        result.push(path.resolve(cwd, target));
    }
    const up = path.resolve(cwd, '..');
    if (up === cwd) {
        return (multiple && result.length > 0 ? result : undefined) as FindUpResult<Multiple>;
    }
    return findUp(names, up, multiple, result);
}

export async function requireDataSourceUrl(schemaFile: string) {
    const zmodel = await loadSchemaDocument(schemaFile);
    const dataSource = zmodel.declarations.find(isDataSource);
    if (!dataSource?.fields.some((f) => f.name === 'url')) {
        throw new CliError('The schema\'s "datasource" must have a "url" field to use this command.');
    }
}

export function getOutputPath(options: { output?: string }, schemaFile: string) {
    if (options.output) {
        return options.output;
    }
    const pkgJsonConfig = getPkgJsonConfig(process.cwd());
    if (pkgJsonConfig.output) {
        return pkgJsonConfig.output;
    } else {
        return path.dirname(schemaFile);
    }
}
export async function getZenStackPackages(
    searchPath: string,
): Promise<Array<{ pkg: string; version: string | undefined }>> {
    const pkgJsonFile = findUp(['package.json'], searchPath, false);
    if (!pkgJsonFile) {
        return [];
    }

    let pkgJson: {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
    };
    try {
        pkgJson = JSON.parse(fs.readFileSync(pkgJsonFile, 'utf8'));
    } catch {
        return [];
    }

    const packages = Array.from(
        new Set(
            [...Object.keys(pkgJson.dependencies ?? {}), ...Object.keys(pkgJson.devDependencies ?? {})].filter((p) =>
                p.startsWith('@zenstackhq/'),
            ),
        ),
    ).sort();

    const require = createRequire(pkgJsonFile);

    const result = packages.map((pkg) => {
        try {
            const depPkgJson = require(`${pkg}/package.json`);
            if (depPkgJson.private) {
                return undefined;
            }
            return { pkg, version: depPkgJson.version as string };
        } catch {
            return { pkg, version: undefined };
        }
    });

    return result.filter((p) => !!p);
}

export function getPluginProvider(plugin: Plugin) {
    const providerField = plugin.fields.find((f) => f.name === 'provider');
    invariant(providerField, `Plugin ${plugin.name} does not have a provider field`);
    const provider = (providerField.value as LiteralExpr).value as string;
    return provider;
}

export async function loadPluginModule(provider: string, basePath: string) {
    if (provider.toLowerCase().endsWith('.zmodel')) {
        // provider is a zmodel file, no plugin code module to load
        return undefined;
    }

    let moduleSpec = provider;
    if (moduleSpec.startsWith('.')) {
        // relative to schema's path
        moduleSpec = path.resolve(basePath, moduleSpec);
    }

    const importAsEsm = async (spec: string) => {
        try {
            const result = (await import(spec)).default as CliPlugin;
            return result;
        } catch (err) {
            throw new CliError(`Failed to load plugin module from ${spec}: ${(err as Error).message}`);
        }
    };

    const jiti = createJiti(pathToFileURL(basePath).toString());
    const importAsTs = async (spec: string) => {
        try {
            const result = (await jiti.import(spec, { default: true })) as CliPlugin;
            return result;
        } catch (err) {
            throw new CliError(`Failed to load plugin module from ${spec}: ${(err as Error).message}`);
        }
    };

    const esmSuffixes = ['.js', '.mjs'];
    const tsSuffixes = ['.ts', '.mts'];

    if (fs.existsSync(moduleSpec) && fs.statSync(moduleSpec).isFile()) {
        // try provider as ESM file
        if (esmSuffixes.some((suffix) => moduleSpec.endsWith(suffix))) {
            return await importAsEsm(pathToFileURL(moduleSpec).toString());
        }

        // try provider as TS file
        if (tsSuffixes.some((suffix) => moduleSpec.endsWith(suffix))) {
            return await importAsTs(moduleSpec);
        }
    }

    // try ESM index files in provider directory
    for (const suffix of esmSuffixes) {
        const indexPath = path.join(moduleSpec, `index${suffix}`);
        if (fs.existsSync(indexPath)) {
            return await importAsEsm(pathToFileURL(indexPath).toString());
        }
    }

    // try TS index files in provider directory
    for (const suffix of tsSuffixes) {
        const indexPath = path.join(moduleSpec, `index${suffix}`);
        if (fs.existsSync(indexPath)) {
            return await importAsTs(indexPath);
        }
    }

    // try jiti import for bare package specifiers (handles workspace packages)
    try {
        const result = (await jiti.import(moduleSpec, { default: true })) as CliPlugin;
        return result;
    } catch {
        // fall through to last resort
    }

    // last resort, try to import as esm directly
    try {
        const mod = await import(moduleSpec);
        // plugin may not export a generator, return undefined in that case
        return mod.default as CliPlugin | undefined;
    } catch (err) {
        const errorCode = (err as NodeJS.ErrnoException)?.code;
        if (errorCode === 'ERR_MODULE_NOT_FOUND' || errorCode === 'MODULE_NOT_FOUND') {
            throw new CliError(`Cannot find plugin module "${provider}". Please make sure the package exists.`);
        }
        throw new CliError(`Failed to load plugin module "${provider}": ${(err as Error).message}`);
    }
}

const FETCH_CLI_MAX_TIME = 1000;
const CLI_CONFIG_ENDPOINT = 'https://zenstack.dev/config/cli-v3.json';

const usageTipsSchema = z.object({
    notifications: z.array(z.object({ title: z.string(), url: z.url().optional(), active: z.boolean() })),
});

/**
 * Starts the usage tips fetch in the background. Returns a callback that, when invoked check if the fetch
 * is complete. If not complete, it will wait until the max time is reached. After that, if fetch is still
 * not complete, just return.
 */
export function startUsageTipsFetch() {
    let fetchedData: z.infer<typeof usageTipsSchema> | undefined = undefined;
    let fetchComplete = false;

    const start = Date.now();
    const controller = new AbortController();

    fetch(CLI_CONFIG_ENDPOINT, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
    })
        .then(async (res) => {
            if (!res.ok) return;
            const data = await res.json();
            const parseResult = usageTipsSchema.safeParse(data);
            if (parseResult.success) {
                fetchedData = parseResult.data;
            }
        })
        .catch(() => {
            // noop
        })
        .finally(() => {
            fetchComplete = true;
        });

    return async () => {
        const elapsed = Date.now() - start;

        if (!fetchComplete && elapsed < FETCH_CLI_MAX_TIME) {
            // wait for the timeout
            await new Promise((resolve) => setTimeout(resolve, FETCH_CLI_MAX_TIME - elapsed));
        }

        if (!fetchComplete) {
            controller.abort();
            return;
        }

        if (!fetchedData) return;

        const activeItems = fetchedData.notifications.filter((item) => item.active);
        // show a random active item
        if (activeItems.length > 0) {
            const item = activeItems[Math.floor(Math.random() * activeItems.length)]!;
            if (item.url) {
                console.log(terminalLink(item.title, item.url));
            } else {
                console.log(item.title);
            }
        }
    };
}
