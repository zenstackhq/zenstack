import { isLiteralExpr } from '@lang/generated/ast';
import { AstNode, ValidationAcceptor } from 'langium';

export function validateDuplicatedDeclarations(
    decls: Array<AstNode & { name: string }>,
    accept: ValidationAcceptor
) {
    const groupByName = decls.reduce<any>((group, decl) => {
        group[decl.name] = group[decl.name] ?? [];
        group[decl.name].push(decl);
        return group;
    }, {});

    for (const [name, decls] of Object.entries<AstNode[]>(groupByName)) {
        if (decls.length > 1) {
            accept('error', `Duplicated declaration name "${name}"`, {
                node: decls[1],
            });
        }
    }
}

export function getStringLiteral(node: AstNode) {
    if (isLiteralExpr(node) && typeof node.value === 'string') {
        return node.value;
    } else {
        return undefined;
    }
}
