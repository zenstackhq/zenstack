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
            // scalar fields to directly pick from Prisma-generated type
            pickFields: string[];

            // relation fields to include
            addFields: { name: string; type: string }[];
        }
    >();

    types.set(authModel.name, { pickFields: getIdFields(authModel).map((f) => f.name), addFields: [] });

    const ensureType = (model: string) => {
        if (!types.has(model)) {
            types.set(model, { pickFields: [], addFields: [] });
        }
    };

    const addPickField = (model: string, field: string) => {
        let fields = types.get(model);
        if (!fields) {
            fields = { pickFields: [], addFields: [] };
            types.set(model, fields);
        }
        if (!fields.pickFields.includes(field)) {
            fields.pickFields.push(field);
        }
    };

    const addAddField = (model: string, name: string, type: string, array: boolean) => {
        let fields = types.get(model);
        if (!fields) {
            fields = { pickFields: [], addFields: [] };
            types.set(model, fields);
        }
        if (!fields.addFields.find((f) => f.name === name)) {
            fields.addFields.push({ name, type: array ? `${type}[]` : type });
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
                    } else {
                        // member is a scalar
                        addPickField(exprType.name, node.member.$refText);
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
                } else {
                    // field is a scalar
                    addPickField(fieldDecl.$container.name, node.target.$refText);
                }
            }
        });
    });

    // generate:
    // `
    // namespace auth {
    //   export type User = WithRequired<Partial<_P.User>, 'id'> & { profile: Profile; };
    //   export type Profile = WithRequired<Partial<_P.Profile>, 'age'>;
    // }
    // `

    return `namespace auth {
    type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
${Array.from(types.entries())
    .map(([model, fields]) => {
        let result = `Partial<_P.${model}>`;

        if (fields.pickFields.length > 0) {
            result = `WithRequired<${result}, ${fields.pickFields.map((f) => `'${f}'`).join('|')}>`;
        }

        if (fields.addFields.length > 0) {
            result = `${result} & { ${fields.addFields.map(({ name, type }) => `${name}: ${type}`).join('; ')} }`;
        }

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
