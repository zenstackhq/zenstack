import { invariant } from '@zenstackhq/common-helpers';
import {
    isAstNode,
    TextDocument,
    URI,
    type AstNode,
    type LangiumDocument,
    type LangiumDocuments,
    type Mutable,
} from 'langium';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDataModel, isDataSource, type Model } from './ast';
import { DB_PROVIDERS_SUPPORTING_LIST_TYPE, STD_LIB_MODULE_NAME } from './constants';
import { createZModelServices, type ZModelServices } from './module';
import {
    getAllFields,
    getDataModelAndTypeDefs,
    getDocument,
    getLiteral,
    hasAttribute,
    resolveImport,
    resolveTransitiveImports,
} from './utils';
import type { ZModelFormatter } from './zmodel-formatter';

/**
 * Loads ZModel document from the given file name. Include the additional document
 * files if given.
 */
export async function loadDocument(
    fileName: string,
    additionalModelFiles: string[] = [],
    mergeImports: boolean = true,
): Promise<
    | { success: true; model: Model; warnings: string[]; services: ZModelServices }
    | { success: false; errors: string[]; warnings: string[] }
> {
    const { ZModelLanguage: services } = createZModelServices(false);
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        return {
            success: false,
            errors: ['invalid schema file extension'],
            warnings: [],
        };
    }

    if (!fs.existsSync(fileName)) {
        return {
            success: false,
            errors: ['schema file does not exist'],
            warnings: [],
        };
    }

    // load standard library

    // isomorphic __dirname
    const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
    const stdLib = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(path.join(_dirname, '../res', STD_LIB_MODULE_NAME))),
    );

    // load the document
    const langiumDocuments = services.shared.workspace.LangiumDocuments;
    const document = await langiumDocuments.getOrCreateDocument(URI.file(path.resolve(fileName)));

    // load imports
    const importedURIs = await loadImports(document, langiumDocuments);
    const importedDocuments: LangiumDocument[] = [];
    for (const uri of importedURIs) {
        importedDocuments.push(await langiumDocuments.getOrCreateDocument(uri));
    }

    // build the document together with standard library, additional modules, and imported documents

    // load additional model files
    const additionalDocs = await Promise.all(
        additionalModelFiles.map((file) =>
            services.shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(path.resolve(file))),
        ),
    );

    await services.shared.workspace.DocumentBuilder.build([stdLib, ...additionalDocs, document, ...importedDocuments], {
        validation: {
            stopAfterLexingErrors: true,
            stopAfterParsingErrors: true,
            stopAfterLinkingErrors: true,
        },
    });

    const diagnostics = langiumDocuments.all
        .flatMap((doc) => (doc.diagnostics ?? []).map((diag) => ({ doc, diag })))
        .filter(({ diag }) => diag.severity === 1 || diag.severity === 2)
        .toArray();

    const errors: string[] = [];
    const warnings: string[] = [];

    if (diagnostics.length > 0) {
        for (const { doc, diag } of diagnostics) {
            const message = `${path.relative(process.cwd(), doc.uri.fsPath)}:${
                diag.range.start.line + 1
            }:${diag.range.start.character + 1} - ${diag.message}`;

            if (diag.severity === 1) {
                errors.push(message);
            } else {
                warnings.push(message);
            }
        }
    }

    if (errors.length > 0) {
        return {
            success: false,
            errors,
            warnings,
        };
    }

    const model = document.parseResult.value as Model;

    if (mergeImports) {
        // merge all declarations into the main document
        const imported = mergeImportsDeclarations(langiumDocuments, model);

        // remove imported documents
        imported.forEach((model) => {
            langiumDocuments.deleteDocument(model.$document!.uri);
            services.shared.workspace.IndexManager.remove(model.$document!.uri);
        });
    }

    // extra validation after merging imported declarations
    const additionalErrors = mergeImports === true ? validationAfterImportMerge(model) : [];
    if (additionalErrors.length > 0) {
        return {
            success: false,
            errors: additionalErrors,
            warnings,
        };
    }

    return {
        success: true,
        model: document.parseResult.value as Model,
        services,
        warnings,
    };
}

async function loadImports(document: LangiumDocument, documents: LangiumDocuments, uris: Set<string> = new Set()) {
    const uriString = document.uri.toString();
    if (!uris.has(uriString)) {
        uris.add(uriString);
        const model = document.parseResult.value as Model;
        for (const imp of model.imports) {
            const importedModel = resolveImport(documents, imp);
            if (importedModel) {
                const importedDoc = getDocument(importedModel);
                await loadImports(importedDoc, documents, uris);
            }
        }
    }
    return Array.from(uris)
        .filter((x) => uriString != x)
        .map((e) => URI.parse(e));
}

function mergeImportsDeclarations(documents: LangiumDocuments, model: Model) {
    const importedModels = resolveTransitiveImports(documents, model);

    const importedDeclarations = importedModels.flatMap((m) => m.declarations);
    model.declarations.push(...importedDeclarations);

    // remove import directives
    model.imports = [];

    // fix $container, $containerIndex, and $containerProperty
    linkContentToContainer(model);

    return importedModels;
}

function linkContentToContainer(node: AstNode): void {
    for (const [name, value] of Object.entries(node)) {
        if (!name.startsWith('$')) {
            if (Array.isArray(value)) {
                value.forEach((item, index) => {
                    if (isAstNode(item)) {
                        (item as Mutable<AstNode>).$container = node;
                        (item as Mutable<AstNode>).$containerProperty = name;
                        (item as Mutable<AstNode>).$containerIndex = index;
                    }
                });
            } else if (isAstNode(value)) {
                (value as Mutable<AstNode>).$container = node;
                (value as Mutable<AstNode>).$containerProperty = name;
            }
        }
    }
}

function validationAfterImportMerge(model: Model) {
    const errors: string[] = [];
    const dataSources = model.declarations.filter((d) => isDataSource(d));
    if (dataSources.length === 0) {
        errors.push('Validation error: schema must have a datasource declaration');
    } else {
        if (dataSources.length > 1) {
            errors.push('Validation error: multiple datasource declarations are not allowed');
        }
    }

    // at most one `@@auth` model
    const decls = getDataModelAndTypeDefs(model, true);
    const authDecls = decls.filter((d) => hasAttribute(d, '@@auth'));
    if (authDecls.length > 1) {
        errors.push('Validation error: Multiple `@@auth` declarations are not allowed');
    }

    // check for usages incompatible with the datasource provider
    const provider = getDataSourceProvider(model);
    invariant(provider !== undefined, 'Datasource provider should be defined at this point');

    for (const decl of model.declarations.filter(isDataModel)) {
        const fields = getAllFields(decl, true);
        for (const field of fields) {
            if (field.type.array && !isDataModel(field.type.reference?.ref)) {
                if (!DB_PROVIDERS_SUPPORTING_LIST_TYPE.includes(provider)) {
                    errors.push(
                        `Validation error: List type is not supported for "${provider}" provider (model: "${decl.name}", field: "${field.name}")`,
                    );
                }
            }
        }
    }

    return errors;
}

/**
 * Formats the given ZModel content.
 */
export async function formatDocument(content: string) {
    const services = createZModelServices().ZModelLanguage;
    const langiumDocuments = services.shared.workspace.LangiumDocuments;
    const document = langiumDocuments.createDocument(URI.parse('memory://schema.zmodel'), content);
    const formatter = services.lsp.Formatter as ZModelFormatter;
    const identifier = { uri: document.uri.toString() };
    const options = formatter.getFormatOptions() ?? {
        insertSpaces: true,
        tabSize: 4,
    };
    const edits = await formatter.formatDocument(document, { options, textDocument: identifier });
    return TextDocument.applyEdits(document.textDocument, edits);
}

function getDataSourceProvider(model: Model) {
    const dataSource = model.declarations.find(isDataSource);
    if (!dataSource) {
        return undefined;
    }
    const provider = dataSource?.fields.find((f) => f.name === 'provider');
    if (!provider) {
        return undefined;
    }
    return getLiteral<string>(provider.value);
}
