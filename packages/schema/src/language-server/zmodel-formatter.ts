import { AbstractFormatter, AstNode, Formatting } from 'langium';

import * as ast from '@zenstackhq/language/ast';

export class ZModelFormatter extends AbstractFormatter {
    protected format(node: AstNode): void {
        const formatter = this.getNodeFormatter(node);
        if (ast.isAbstractDeclaration(node)) {
            const bracesOpen = formatter.keyword('{');
            const bracesClose = formatter.keyword('}');
            formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent());
            bracesOpen.prepend(Formatting.oneSpace());
            bracesClose.prepend(Formatting.newLine());
        } else if (ast.isModel(node)) {
            const model = node as ast.Model;
            const nodes = formatter.nodes(...model.declarations);
            nodes.prepend(Formatting.noIndent());
        }
    }
}
