import { isPlugin, Model } from '@zenstackhq/language/ast';
import { getLiteral } from '@zenstackhq/sdk';
import { DefaultWorkspaceManager, interruptAndCheck, LangiumDocument } from 'langium';
import fs from 'fs';
import path from 'path';
import { CancellationToken, WorkspaceFolder } from 'vscode-languageserver';
import { URI, Utils } from 'vscode-uri';
import { PLUGIN_MODULE_NAME, STD_LIB_MODULE_NAME } from './constants';

/**
 * Custom Langium WorkspaceManager implementation which automatically loads stdlib.zmodel
 */
export class ZModelWorkspaceManager extends DefaultWorkspaceManager {
    public pluginModels = new Set<string>();

    protected async loadAdditionalDocuments(
        _folders: WorkspaceFolder[],
        _collector: (document: LangiumDocument) => void
    ): Promise<void> {
        await super.loadAdditionalDocuments(_folders, _collector);
        
        let stdLibPath: string;        
        // First, try to find the stdlib from an installed zenstack package
        // in the project's node_modules
        let installedStdlibPath: string | undefined;
        for (const folder of _folders) {
            const folderPath = URI.parse(folder.uri).fsPath;
            try {
                // Try to resolve zenstack from the workspace folder
                const languagePackagePath = require.resolve('zenstack/package.json', { 
                    paths: [folderPath] 
                });
                const languagePackageDir = path.dirname(languagePackagePath);
                const candidateStdlibPath = path.join(languagePackageDir, 'res', STD_LIB_MODULE_NAME);
                
                // Check if the stdlib file exists in the installed package
                if (fs.existsSync(candidateStdlibPath)) {
                    installedStdlibPath = candidateStdlibPath;
                    console.log(`Found installed zenstack package stdlib at ${installedStdlibPath}`);
                    break;
                } 
            } catch (error) {
                // Package not found or other error, continue to next folder
                console.error(`error happen when trying to find stdlib in folder ${folder.uri}:`, error);
                continue;
            }
        }
        
        if (installedStdlibPath) {
            stdLibPath = installedStdlibPath;
        } else {
            // Fallback to bundled stdlib
            stdLibPath = path.join(__dirname, '../res', STD_LIB_MODULE_NAME);
            console.log(`Using bundled stdlib in extension`);
        }
        
        const stdLibUri = URI.file(stdLibPath);
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

        if (this.pluginModels.size > 0) {
            console.log(`Used plugin documents: ${Array.from(this.pluginModels)}`);

            // the loaded plugin models would be removed from the set
            const unLoadedPluginModels = new Set(this.pluginModels);

            await Promise.all(
                folders
                    .map((wf) => [wf, this.getRootFolder(wf)] as [WorkspaceFolder, URI])
                    .map(async (entry) => this.loadPluginModels(...entry, unLoadedPluginModels, collector))
            );

            if (unLoadedPluginModels.size > 0) {
                console.warn(`The following plugin documents could not be loaded: ${Array.from(unLoadedPluginModels)}`);
            }
        }

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
        const content = await (
            await this.fileSystemProvider.readDirectory(folderPath)
        ).sort((a, b) => {
            // make sure the node_moudules folder is always the first one to be checked
            // so it could be early exited if the plugin is found
            if (a.isDirectory && b.isDirectory) {
                const aName = Utils.basename(a.uri);
                if (aName === 'node_modules') {
                    return -1;
                } else {
                    return 1;
                }
            } else {
                return 0;
            }
        });

        for (const entry of content) {
            if (entry.isDirectory) {
                const name = Utils.basename(entry.uri);
                if (name === 'node_modules') {
                    for (const plugin of Array.from(pluginModels)) {
                        const path = Utils.joinPath(entry.uri, plugin, PLUGIN_MODULE_NAME);
                        try {
                            this.fileSystemProvider.readFileSync(path);
                            const document = this.langiumDocuments.getOrCreateDocument(path);
                            collector(document);
                            console.log(`Adding plugin document from ${path.path}`);

                            pluginModels.delete(plugin);
                            // early exit if all plugins are loaded
                            if (pluginModels.size === 0) {
                                return;
                            }
                        } catch {
                            // no-op. The module might be found in another node_modules folder
                            // will show the warning message eventually if not found
                        }
                    }
                } else {
                    await this.loadPluginModels(workspaceFolder, entry.uri, pluginModels, collector);
                }
            }
        }
    }
}
