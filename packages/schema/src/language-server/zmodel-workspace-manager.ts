import { DefaultWorkspaceManager, LangiumDocument } from 'langium';
import path from 'path';
import { WorkspaceFolder } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { STD_LIB_MODULE_NAME } from './constants';

/**
 * Custom Langium WorkspaceManager implementation which automatically loads stdlib.zmodel
 */
export default class ZModelWorkspaceManager extends DefaultWorkspaceManager {
    protected async loadAdditionalDocuments(
        _folders: WorkspaceFolder[],
        _collector: (document: LangiumDocument) => void
    ): Promise<void> {
        await super.loadAdditionalDocuments(_folders, _collector);
        const stdLibUri = URI.file(
            path.join(__dirname, '../res', STD_LIB_MODULE_NAME)
        );
        console.log(`Adding stdlib document from ${stdLibUri}`);
        const stdlib = this.langiumDocuments.getOrCreateDocument(stdLibUri);
        _collector(stdlib);
    }
}
