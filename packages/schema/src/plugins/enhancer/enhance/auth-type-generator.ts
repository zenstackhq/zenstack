import { getIdFields, isAuthInvocation, isDataModelFieldReference } from '@zenstackhq/sdk';
import {
    DataModel,
    DataModelField,
    Expression,
    isDataModel,
    isMemberAccessExpr,
    type Model,
} from '@zenstackhq/sdk/ast';
import { streamAst, type AstNode } from 'langium';
import { isCollectionPredicate } from '../../../utils/ast-utils';

/**
 * Generate types for typing the `user` context object passed to the `enhance` call, based
 * on the fields (potentially deeply) access through `auth()`.
 */
export function generateAuthType(model: Model, authModel: DataModel) {
    const types = new Map<
        string,
        {
            // relation fields to require
            requiredRelations: { name: string; type: string }[];
        }
    >();

    types.set(authModel.name, { requiredRelations: [] });

    const ensureType = (model: string) => {
        if (!types.has(model)) {
            types.set(model, { requiredRelations: [] });
        }
    };

    const addAddField = (model: string, name: string, type: string, array: boolean) => {
        let fields = types.get(model);
        if (!fields) {
            fields = { requiredRelations: [] };
            types.set(model, fields);
        }
        if (!fields.requiredRelations.find((f) => f.name === name)) {
            fields.requiredRelations.push({ name, type: array ? `${type}[]` : type });
        }
    };

    // get all policy expressions involving `auth()`
    const authInvolvedExprs = streamAst(model).filter(isAuthAccess);

    // traverse the expressions and collect types and fields involved
    authInvolvedExprs.forEach((expr) => {
        streamAst(expr).forEach((node) => {
            if (isMemberAccessExpr(node)) {
                const exprType = node.operand.$resolvedType?.decl;
                if (isDataModel(exprType)) {
                    const memberDecl = node.member.ref;
                    if (isDataModel(memberDecl?.type.reference?.ref)) {
                        // member is a relation
                        const fieldType = memberDecl.type.reference.ref.name;
                        ensureType(fieldType);
                        addAddField(exprType.name, memberDecl.name, fieldType, memberDecl.type.array);
                    }
                }
            }

            if (isDataModelFieldReference(node)) {
                // this can happen inside collection predicates
                const fieldDecl = node.target.ref as DataModelField;
                const fieldType = fieldDecl.type.reference?.ref;
                if (isDataModel(fieldType)) {
                    // field is a relation
                    ensureType(fieldType.name);
                    addAddField(fieldDecl.$container.name, node.target.$refText, fieldType.name, fieldDecl.type.array);
                }
            }
        });
    });

    // generate:
    // `
    // namespace auth {
    //   export type User = WithRequired<Partial<_P.User>, 'id'> & { profile: Profile; } & Record<string, unknown>;
    //   export type Profile = WithRequired<Partial<_P.Profile>, 'age'> & Record<string, unknown>;
    // }
    // `

    return `export namespace auth {
    type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
${Array.from(types.entries())
    .map(([model, fields]) => {
        let result = `Partial<_P.${model}>`;

        if (model === authModel.name) {
            // auth model's id fields are always required
            const idFields = getIdFields(authModel).map((f) => f.name);
            if (idFields.length > 0) {
                result = `WithRequired<${result}, ${idFields.map((f) => `'${f}'`).join('|')}>`;
            }
        }

        if (fields.requiredRelations.length > 0) {
            // merge required relation fields
            result = `${result} & { ${fields.requiredRelations.map((f) => `${f.name}: ${f.type}`).join('; ')} }`;
        }

        result = `${result} & Record<string, unknown>`;

        return `    export type ${model} = ${result};`;
    })
    .join('\n')}
}`;
}

function isAuthAccess(node: AstNode): node is Expression {
    if (isAuthInvocation(node)) {
        return true;
    }

    if (isMemberAccessExpr(node) && isAuthAccess(node.operand)) {
        return true;
    }

    if (isCollectionPredicate(node)) {
        if (isAuthAccess(node.left)) {
            return true;
        }
    }

    return false;
}
