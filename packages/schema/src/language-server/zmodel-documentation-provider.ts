import { AstNode, JSDocDocumentationProvider } from 'langium';

/**
 * Documentation provider that first tries to use triple-slash comments and falls back to JSDoc comments.
 */
export class ZModelDocumentationProvider extends JSDocDocumentationProvider {
    getDocumentation(node: AstNode): string | undefined {
        // prefer to use triple-slash comments
        if ('comments' in node && Array.isArray(node.comments) && node.comments.length > 0) {
            return node.comments.map((c: string) => c.replace(/^[/]*\s*/, '')).join('\n');
        }

        // fall back to JSDoc comments
        return super.getDocumentation(node);
    }
}
