import { getIdFields, getPrismaClientGenerator, isAuthInvocation, isDataModelFieldReference } from '@zenstackhq/sdk';
import {
    DataModel,
    DataModelField,
    Expression,
    isDataModel,
    isMemberAccessExpr,
    isTypeDef,
    TypeDef,
    type Model,
} from '@zenstackhq/sdk/ast';
import { streamAst, type AstNode } from 'langium';
import { isCollectionPredicate } from '../../../utils/ast-utils';

/**
 * Generate types for typing the `user` context object passed to the `enhance` call, based
 * on the fields (potentially deeply) access through `auth()`.
 */
export function generateAuthType(model: Model, authDecl: DataModel | TypeDef) {
    const types = new Map<
        string,
        {
            isTypeDef: boolean;
            // relation fields to require
            requiredRelations: { name: string; type: string }[];
        }
    >();

    types.set(authDecl.name, { isTypeDef: isTypeDef(authDecl), requiredRelations: [] });

    const findType = (name: string) =>
        model.declarations.find((d) => (isDataModel(d) || isTypeDef(d)) && d.name === name);

    const ensureType = (name: string) => {
        if (!types.has(name)) {
            const decl = findType(name);
            if (!decl) {
                return;
            }
            types.set(name, { isTypeDef: isTypeDef(decl), requiredRelations: [] });
        }
    };

    const addTypeField = (typeName: string, fieldName: string, fieldType: string, array: boolean) => {
        let typeInfo = types.get(typeName);
        if (!typeInfo) {
            const decl = findType(typeName);
            typeInfo = { isTypeDef: isTypeDef(decl), requiredRelations: [] };
            types.set(typeName, typeInfo);
        }
        if (!typeInfo.requiredRelations.find((f) => f.name === fieldName)) {
            typeInfo.requiredRelations.push({ name: fieldName, type: array ? `${fieldType}[]` : fieldType });
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
                        addTypeField(exprType.name, memberDecl.name, fieldType, memberDecl.type.array);
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
                    addTypeField(fieldDecl.$container.name, node.target.$refText, fieldType.name, fieldDecl.type.array);
                }
            }
        });
    });

    const prismaGenerator = getPrismaClientGenerator(model);
    const isNewGenerator = !!prismaGenerator?.isNewGenerator;

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
    .map(([type, typeInfo]) => {
        // TypeDef types are generated in "json-types.ts" for the new "prisma-client" generator
        const typeRef = isNewGenerator && typeInfo.isTypeDef ? `$TypeDefs.${type}` : `_P.${type}`;
        let result = `Partial<${typeRef}>`;

        if (type === authDecl.name) {
            // auth model's id fields are always required
            const idFields = getIdFields(authDecl).map((f) => f.name);
            if (idFields.length > 0) {
                result = `WithRequired<${result}, ${idFields.map((f) => `'${f}'`).join('|')}>`;
            }
        }

        if (typeInfo.requiredRelations.length > 0) {
            // merge required relation fields
            result = `${result} & { ${typeInfo.requiredRelations.map((f) => `${f.name}: ${f.type}`).join('; ')} }`;
        }

        result = `${result} & Record<string, unknown>`;

        return `    export type ${type} = ${result};`;
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
