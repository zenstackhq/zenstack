import { isDataSource, isPlugin, Model } from '@zenstackhq/language/ast';
import { getDataModels, getLiteral, hasAttribute } from '@zenstackhq/sdk';
import colors from 'colors';
import fs from 'fs';
import getLatestVersion from 'get-latest-version';
import { AstNode, getDocument, LangiumDocument, LangiumDocuments, Mutable } from 'langium';
import { NodeFileSystem } from 'langium/node';
import path from 'path';
import semver from 'semver';
import { URI } from 'vscode-uri';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from '../language-server/constants';
import { createZModelServices, ZModelServices } from '../language-server/zmodel-module';
import { mergeBaseModel, resolveImport, resolveTransitiveImports } from '../utils/ast-utils';
import { getVersion } from '../utils/version-utils';
import { CliError } from './cli-error';

// required minimal version of Prisma
export const requiredPrismaVersion = '4.8.0';

/**
 * Loads a zmodel document from a file.
 * @param fileName File name
 * @param services Language services
 * @returns Parsed and validated AST
 */
export async function loadDocument(fileName: string): Promise<Model> {
    const services = createZModelServices(NodeFileSystem).ZModel;
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(colors.yellow(`Please choose a file with extension: ${extensions}.`));
        throw new CliError('invalid schema file');
    }

    if (!fs.existsSync(fileName)) {
        console.error(colors.red(`File ${fileName} does not exist.`));
        throw new CliError('schema file does not exist');
    }

    // load standard library
    const stdLib = services.shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(path.join(__dirname, '../res', STD_LIB_MODULE_NAME)))
    );

    // load documents provided by plugins
    const pluginDocuments = await getPluginDocuments(services, fileName);

    const langiumDocuments = services.shared.workspace.LangiumDocuments;
    // load the document
    const document = langiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));

    // load all imports
    const importedURIs = eagerLoadAllImports(document, langiumDocuments);

    const importedDocuments = importedURIs.map((uri) => langiumDocuments.getOrCreateDocument(uri));

    // build the document together with standard library and plugin modules
    await services.shared.workspace.DocumentBuilder.build(
        [stdLib, ...pluginDocuments, document, ...importedDocuments],
        {
            validationChecks: 'all',
        }
    );

    const validationErrors = langiumDocuments.all
        .flatMap((d) => d.diagnostics ?? [])
        .filter((e) => e.severity === 1)
        .toArray();

    if (validationErrors.length > 0) {
        console.error(colors.red('Validation errors:'));
        for (const validationError of validationErrors) {
            console.error(
                colors.red(
                    `line ${validationError.range.start.line + 1}: ${
                        validationError.message
                    } [${document.textDocument.getText(validationError.range)}]`
                )
            );
        }
        throw new CliError('schema validation errors');
    }

    const model = document.parseResult.value as Model;

    mergeImportsDeclarations(langiumDocuments, model);

    validationAfterMerge(model);

    mergeBaseModel(model);

    return model;
}

// check global unique thing after merge imports
function validationAfterMerge(model: Model) {
    const dataSources = model.declarations.filter((d) => isDataSource(d));
    if (dataSources.length == 0) {
        console.error(colors.red('Validation error: Model must define a datasource'));
        throw new CliError('schema validation errors');
    } else if (dataSources.length > 1) {
        console.error(colors.red('Validation error: Multiple datasource declarations are not allowed'));
        throw new CliError('schema validation errors');
    }

    // at most one `@@auth` model
    const dataModels = getDataModels(model, true);
    const authModels = dataModels.filter((d) => hasAttribute(d, '@@auth'));
    if (authModels.length > 1) {
        console.error(colors.red('Validation error: Multiple `@@auth` models are not allowed'));
        throw new CliError('schema validation errors');
    }
}

export function eagerLoadAllImports(
    document: LangiumDocument,
    documents: LangiumDocuments,
    uris: Set<string> = new Set()
) {
    const uriString = document.uri.toString();
    if (!uris.has(uriString)) {
        uris.add(uriString);
        const model = document.parseResult.value as Model;

        for (const imp of model.imports) {
            const importedModel = resolveImport(documents, imp);
            if (importedModel) {
                const importedDoc = getDocument(importedModel);
                eagerLoadAllImports(importedDoc, documents, uris);
            }
        }
    }

    return Array.from(uris)
        .filter((x) => uriString != x)
        .map((e) => URI.parse(e));
}

export function mergeImportsDeclarations(documents: LangiumDocuments, model: Model) {
    const importedModels = resolveTransitiveImports(documents, model);

    const importedDeclarations = importedModels.flatMap((m) => m.declarations);

    importedDeclarations.forEach((d) => {
        const mutable = d as Mutable<AstNode>;
        // The plugin might use $container to access the model
        // need to make sure it is always resolved to the main model
        mutable.$container = model;
    });

    model.declarations.push(...importedDeclarations);
}

export async function getPluginDocuments(services: ZModelServices, fileName: string): Promise<LangiumDocument[]> {
    // parse the user document (without validation)
    const parseResult = services.parser.LangiumParser.parse(fs.readFileSync(fileName, { encoding: 'utf-8' }));
    const parsed = parseResult.value as Model;

    // traverse plugins and collect "plugin.zmodel" documents
    const result: LangiumDocument[] = [];
    parsed.declarations.forEach((decl) => {
        if (isPlugin(decl)) {
            const providerField = decl.fields.find((f) => f.name === 'provider');
            if (providerField) {
                let provider = getLiteral<string>(providerField.value);
                if (provider) {
                    try {
                        if (provider.startsWith('.')) {
                            // resolve relative path against the schema file
                            provider = path.resolve(path.dirname(fileName), provider);
                        }
                        const pluginEntrance = require.resolve(`${provider}`);
                        const pluginModelFile = path.join(path.dirname(pluginEntrance), PLUGIN_MODULE_NAME);
                        if (fs.existsSync(pluginModelFile)) {
                            result.push(
                                services.shared.workspace.LangiumDocuments.getOrCreateDocument(
                                    URI.file(pluginModelFile)
                                )
                            );
                        }
                    } catch {
                        // noop
                    }
                }
            }
        }
    });
    return result;
}

export function getZenStackPackages(projectPath: string) {
    let pkgJson: { dependencies: Record<string, unknown>; devDependencies: Record<string, unknown> };
    const resolvedPath = path.resolve(projectPath);
    try {
        pkgJson = require(path.join(resolvedPath, 'package.json'));
    } catch {
        return undefined;
    }

    const packages = [
        ...Object.keys(pkgJson.dependencies ?? {}).filter((p) => p.startsWith('@zenstackhq/')),
        ...Object.keys(pkgJson.devDependencies ?? {}).filter((p) => p.startsWith('@zenstackhq/')),
    ];

    const result = packages.map((pkg) => {
        try {
            const resolved = require.resolve(`${pkg}/package.json`, { paths: [resolvedPath] });
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return { pkg, version: require(resolved).version };
        } catch {
            return { pkg, version: undefined };
        }
    });

    result.splice(0, 0, { pkg: 'zenstack', version: getVersion() });

    return result;
}

export function checkRequiredPackage(packageName: string, minVersion?: string) {
    let packageVersion: string;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        packageVersion = require(`${packageName}/package.json`).version;
    } catch (error) {
        console.error(colors.red(`${packageName} not found, please install it`));
        throw new CliError(`${packageName} not found`);
    }

    if (minVersion && semver.lt(packageVersion, minVersion)) {
        console.error(
            colors.red(
                `${packageName} needs to be above ${minVersion}, the installed version is ${packageVersion}, please upgrade it`
            )
        );
        throw new CliError(`${packageName} version is too low`);
    }
}

export async function checkNewVersion() {
    const currVersion = getVersion();
    const latestVersion = await getLatestVersion('zenstack');
    if (latestVersion && semver.gt(latestVersion, currVersion)) {
        console.log(`A newer version ${colors.cyan(latestVersion)} is available.`);
    }
}
