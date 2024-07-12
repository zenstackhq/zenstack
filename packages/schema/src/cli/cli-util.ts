import { isDataSource, isPlugin, Model } from '@zenstackhq/language/ast';
import { getDataModels, getLiteral, hasAttribute } from '@zenstackhq/sdk';
import colors from 'colors';
import fs from 'fs';
import { getDocument, LangiumDocument, LangiumDocuments, linkContentToContainer } from 'langium';
import { NodeFileSystem } from 'langium/node';
import path from 'path';
import semver from 'semver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from '../language-server/constants';
import { ZModelFormatter } from '../language-server/zmodel-formatter';
import { createZModelServices, ZModelServices } from '../language-server/zmodel-module';
import { mergeBaseModels, resolveImport, resolveTransitiveImports } from '../utils/ast-utils';
import { findUp } from '../utils/pkg-utils';
import { getVersion } from '../utils/version-utils';
import { CliError } from './cli-error';

// required minimal version of Prisma
export const requiredPrismaVersion = '4.8.0';

const CHECK_VERSION_TIMEOUT = 1000;

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

    // build the document together with standard library, plugin modules, and imported documents
    await services.shared.workspace.DocumentBuilder.build(
        [stdLib, ...pluginDocuments, document, ...importedDocuments],
        {
            validationChecks: 'all',
        }
    );

    const diagnostics = langiumDocuments.all
        .flatMap((doc) => (doc.diagnostics ?? []).map((diag) => ({ doc, diag })))
        .filter(({ diag }) => diag.severity === 1 || diag.severity === 2)
        .toArray();

    let hasErrors = false;

    if (diagnostics.length > 0) {
        for (const { doc, diag } of diagnostics) {
            const message = `${path.relative(process.cwd(), doc.uri.fsPath)}:${diag.range.start.line + 1}:${
                diag.range.start.character + 1
            } - ${diag.message}`;

            if (diag.severity === 1) {
                console.error(colors.red(message));
                hasErrors = true;
            } else {
                console.warn(colors.yellow(message));
            }
        }

        if (hasErrors) {
            throw new CliError('Schema contains validation errors');
        }
    }

    const model = document.parseResult.value as Model;

    // merge all declarations into the main document
    const imported = mergeImportsDeclarations(langiumDocuments, model);

    // remove imported documents
    await services.shared.workspace.DocumentBuilder.update(
        [],
        imported.map((m) => m.$document!.uri)
    );

    validationAfterImportMerge(model);

    // merge fields and attributes from base models
    mergeBaseModels(model, services.references.Linker);

    // finally relink all references
    const relinkedModel = await relinkAll(model, services);

    return relinkedModel;
}

// check global unique thing after merge imports
function validationAfterImportMerge(model: Model) {
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
    model.declarations.push(...importedDeclarations);

    // remove import directives
    model.imports = [];

    // fix $containerIndex
    linkContentToContainer(model);

    return importedModels;
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
                const provider = getLiteral<string>(providerField.value);
                if (provider) {
                    let pluginEntrance: string | undefined;
                    try {
                        // direct require
                        pluginEntrance = require.resolve(provider);
                    } catch {
                        if (!path.isAbsolute(provider)) {
                            // relative path
                            try {
                                pluginEntrance = require.resolve(path.join(path.dirname(fileName), provider));
                            } catch {
                                // noop
                            }
                        }
                    }

                    if (pluginEntrance) {
                        const pluginModelFile = path.join(path.dirname(pluginEntrance), PLUGIN_MODULE_NAME);
                        if (fs.existsSync(pluginModelFile)) {
                            result.push(
                                services.shared.workspace.LangiumDocuments.getOrCreateDocument(
                                    URI.file(pluginModelFile)
                                )
                            );
                        }
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
    let latestVersion: string;
    try {
        latestVersion = await getLatestVersion();
    } catch {
        // noop
        return;
    }

    if (latestVersion && semver.gt(latestVersion, currVersion)) {
        console.log(`A newer version ${colors.cyan(latestVersion)} is available.`);
    }
}

export async function getLatestVersion() {
    const fetchResult = await fetch('https://registry.npmjs.org/zenstack', {
        headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*' },
        signal: AbortSignal.timeout(CHECK_VERSION_TIMEOUT),
    });

    if (fetchResult.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await fetchResult.json();
        const latestVersion = data?.['dist-tags']?.latest;
        if (typeof latestVersion === 'string' && semver.valid(latestVersion)) {
            return latestVersion;
        }
    }

    throw new Error('invalid npm registry response');
}

export async function formatDocument(fileName: string, isPrismaStyle = true) {
    const services = createZModelServices(NodeFileSystem).ZModel;
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(colors.yellow(`Please choose a file with extension: ${extensions}.`));
        throw new CliError('invalid schema file');
    }

    const langiumDocuments = services.shared.workspace.LangiumDocuments;
    const document = langiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));

    const formatter = services.lsp.Formatter as ZModelFormatter;

    formatter.setPrismaStyle(isPrismaStyle);

    const identifier = { uri: document.uri.toString() };
    const options = formatter.getFormatOptions() ?? {
        insertSpaces: true,
        tabSize: 4,
    };

    const edits = await formatter.formatDocument(document, { options, textDocument: identifier });
    return TextDocument.applyEdits(document.textDocument, edits);
}

export function getDefaultSchemaLocation() {
    // handle override from package.json
    const pkgJsonPath = findUp(['package.json']);
    if (pkgJsonPath) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (typeof pkgJson?.zenstack?.schema === 'string') {
            if (path.isAbsolute(pkgJson.zenstack.schema)) {
                return pkgJson.zenstack.schema;
            } else {
                // resolve relative to package.json
                return path.resolve(path.dirname(pkgJsonPath), pkgJson.zenstack.schema);
            }
        }
    }

    return path.resolve('schema.zmodel');
}

async function relinkAll(model: Model, services: ZModelServices) {
    const doc = model.$document!;

    // unlink the document
    services.references.Linker.unlink(doc);

    // remove current document
    await services.shared.workspace.DocumentBuilder.update([], [doc.uri]);

    // recreate and load the document
    const newDoc = services.shared.workspace.LangiumDocumentFactory.fromModel(model, doc.uri);
    services.shared.workspace.LangiumDocuments.addDocument(newDoc);

    // rebuild the document
    await services.shared.workspace.DocumentBuilder.build([newDoc], { validationChecks: 'all' });

    return newDoc.parseResult.value as Model;
}
