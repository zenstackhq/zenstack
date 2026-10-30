import type { AstNode, MaybePromise, ValidationAcceptor } from 'langium';
import { isDataField } from '../generated/ast';

/**
 * AST validator contract
 */
export interface AstValidator<T extends AstNode> {
    /**
     * Validates an AST node
     */
    validate(node: T, accept: ValidationAcceptor): MaybePromise<void>;
}

/**
 * Checks if the given declarations have duplicated names
 */
export function validateDuplicatedDeclarations(
    container: AstNode,
    decls: Array<AstNode & { name: string }>,
    accept: ValidationAcceptor,
): void {
    const groupByName = decls.reduce<Record<string, Array<AstNode & { name: string }>>>(
        (group, decl) => {
            // Use a null-prototype map to avoid issues with names like "__proto__"/"constructor".
            group[decl.name] = group[decl.name] ?? [];
            group[decl.name]!.push(decl);
            return group;
        },
        Object.create(null) as Record<string, Array<AstNode & { name: string }>>,
    );

    for (const [name, decls] of Object.entries<AstNode[]>(groupByName)) {
        if (decls.length > 1) {
            let errorField = decls[1]!;
            if (isDataField(decls[0])) {
                const nonInheritedFields = decls.filter((x) => !(isDataField(x) && x.$container !== container));
                if (nonInheritedFields.length > 0) {
                    errorField = nonInheritedFields.slice(-1)[0]!;
                }
            }

            accept('error', `Duplicated declaration name "${name}"`, {
                node: errorField,
            });
        }
    }
}
