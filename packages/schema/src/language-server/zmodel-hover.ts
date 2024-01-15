import { AstNode, LangiumDocument, MultilineCommentHoverProvider } from 'langium';
import { Hover, HoverParams } from 'vscode-languageclient';

export class ZModelHoverProvider extends MultilineCommentHoverProvider {
    override async getHoverContent(
        document: LangiumDocument<AstNode>,
        params: HoverParams
    ): Promise<Hover | undefined> {
        try {
            return await super.getHoverContent(document, params);
        } catch (e) {
            console.error('Hover error:', (e as Error).message);
            return undefined;
        }
    }
}
