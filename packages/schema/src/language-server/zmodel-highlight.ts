import { DefaultDocumentHighlightProvider, LangiumDocument } from 'langium';
import { DocumentHighlight, DocumentHighlightParams } from 'vscode-languageserver';

export class ZModelHighlightProvider extends DefaultDocumentHighlightProvider {
    override async getDocumentHighlight(
        document: LangiumDocument,
        params: DocumentHighlightParams
    ): Promise<DocumentHighlight[] | undefined> {
        try {
            return await super.getDocumentHighlight(document, params);
        } catch (e) {
            console.error('Highlight error:', (e as Error).message);
            return undefined;
        }
    }
}
