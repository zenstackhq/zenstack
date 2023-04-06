import { isPlugin, Model } from '@zenstackhq/language/ast';
import { getLiteral } from '@zenstackhq/sdk';
import { DefaultWorkspaceManager, interruptAndCheck, LangiumDocument } from 'langium';
import path, { resolve } from 'path';
import { CancellationToken, WorkspaceFolder } from 'vscode-languageserver';
import { URI, Utils } from 'vscode-uri';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from './constants';

/**
 * Custom Langium WorkspaceManager implementation which automatically loads stdlib.zmodel
 */
export default class ZModelWorkspaceManager extends DefaultWorkspaceManager {
    public pluginModels = new Set<string>();

    protected async loadAdditionalDocuments(
        _folders: WorkspaceFolder[],
        _collector: (document: LangiumDocument) => void
    ): Promise<void> {
        await super.loadAdditionalDocuments(_folders, _collector);
        const stdLibUri = URI.file(path.join(__dirname, '../res', STD_LIB_MODULE_NAME));

        resolve(__dirname, '../res', STD_LIB_MODULE_NAME);
        console.log(`Adding stdlib document from ${stdLibUri}`);
        const stdlib = this.langiumDocuments.getOrCreateDocument(stdLibUri);
        _collector(stdlib);
    }

    override async initializeWorkspace(
        folders: WorkspaceFolder[],
        cancelToken = CancellationToken.None
    ): Promise<void> {
        const fileExtensions = this.serviceRegistry.all.flatMap((e) => e.LanguageMetaData.fileExtensions);
        const documents: LangiumDocument[] = [];
        const collector = (document: LangiumDocument) => {
            documents.push(document);
            if (!this.langiumDocuments.hasDocument(document.uri)) {
                this.langiumDocuments.addDocument(document);
            }
        };
        // Even though we don't await the initialization of the workspace manager,
        // we can still assume that all library documents and file documents are loaded by the time we start building documents.
        // The mutex prevents anything from performing a workspace build until we check the cancellation token
        await this.loadAdditionalDocuments(folders, collector);
        await Promise.all(
            folders
                .map((wf) => [wf, this.getRootFolder(wf)] as [WorkspaceFolder, URI])
                .map(async (entry) => this.traverseFolder(...entry, fileExtensions, collector))
        );

        // find plugin models
        documents.forEach((doc) => {
            const parsed = doc.parseResult.value as Model;
            parsed.declarations.forEach((decl) => {
                if (isPlugin(decl)) {
                    const providerField = decl.fields.find((f) => f.name === 'provider');
                    if (providerField) {
                        const provider = getLiteral<string>(providerField.value);
                        if (provider) {
                            this.pluginModels.add(provider);
                        }
                    }
                }
            });
        });

        console.log(`Used plugin documents: ${Array.from(this.pluginModels)}`);

        await Promise.all(
            folders
                .map((wf) => [wf, this.getRootFolder(wf)] as [WorkspaceFolder, URI])
                .map(async (entry) => this.loadPluginModels(...entry, new Set(this.pluginModels), collector))
        );

        // Only after creating all documents do we check whether we need to cancel the initialization
        // The document builder will later pick up on all unprocessed documents
        await interruptAndCheck(cancelToken);
        await this.documentBuilder.build(documents, undefined, cancelToken);
    }

    protected async loadPluginModels(
        workspaceFolder: WorkspaceFolder,
        folderPath: URI,
        pluginModels: Set<string>,
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        const content = await this.fileSystemProvider.readDirectory(folderPath);

        for (const entry of content) {
            if (entry.isDirectory) {
                const name = Utils.basename(entry.uri);
                if (name === 'node_modules') {
                    for (const plugin of pluginModels) {
                        const path = Utils.joinPath(entry.uri, plugin, PLUGIN_MODULE_NAME);
                        try {
                            this.fileSystemProvider.readFileSync(path);
                            const document = this.langiumDocuments.getOrCreateDocument(path);
                            collector(document);
                            console.log(`Adding plugin document from ${path}`);

                            pluginModels.delete(plugin);
                            // early exit if all plugins are loaded
                            if (pluginModels.size === 0) {
                                return;
                            }
                        } catch {
                            //no-op
                        }
                    }
                } else {
                    await this.loadPluginModels(workspaceFolder, entry.uri, pluginModels, collector);
                }
            }
        }
    }
}
