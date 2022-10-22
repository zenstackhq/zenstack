import { SCALAR_TYPES } from '@lang/constants';
import {
    AttributeParam,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
} from '@lang/generated/ast';
import { AstValidator } from '@lang/types';
import { ValidationAcceptor } from 'langium';
import {
    assignableToAttributeParam,
    validateDuplicatedDeclarations,
} from './utils';
import pluralize from 'pluralize';

export default class DataModelValidator implements AstValidator<DataModel> {
    validate(dm: DataModel, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(dm.fields, accept);
        this.validateFields(dm, accept);
        this.validateAttributes(dm, accept);
    }

    private validateFields(dm: DataModel, accept: ValidationAcceptor) {
        const idFields = dm.fields.filter((f) =>
            f.attributes.find((attr) => attr.decl.ref?.name === '@id')
        );
        if (idFields.length === 0) {
            accept('error', 'Model must include a field with @id attribute', {
                node: dm,
            });
        } else if (idFields.length > 1) {
            accept(
                'error',
                'Model can include at most one field with @id attribute',
                {
                    node: dm,
                }
            );
        } else {
            if (idFields[0].type.optional) {
                accept(
                    'error',
                    'Field with @id attribute must not be optional',
                    { node: idFields[0] }
                );
            }

            if (
                idFields[0].type.array ||
                !idFields[0].type.type ||
                !SCALAR_TYPES.includes(idFields[0].type.type)
            ) {
                accept(
                    'error',
                    'Field with @id attribute must be of scalar type',
                    { node: idFields[0] }
                );
            }
        }

        dm.fields.forEach((field) => this.validateField(field, accept));
    }

    private validateField(
        field: DataModelField,
        accept: ValidationAcceptor
    ): void {
        if (field.type.array && field.type.optional) {
            accept(
                'error',
                'Optional lists are not supported. Use either `Type[]` or `Type?`',
                { node: field.type }
            );
        }

        field.attributes.forEach((attr) =>
            this.validateAttributeApplication(attr, accept)
        );
    }

    private validateAttributes(dm: DataModel, accept: ValidationAcceptor) {
        dm.attributes.forEach((attr) => {
            this.validateAttributeApplication(attr, accept);
        });
    }

    private validateAttributeApplication(
        attr: DataModelAttribute | DataModelFieldAttribute,
        accept: ValidationAcceptor
    ) {
        const decl = attr.decl.ref;
        if (!decl) {
            throw new Error(`Reference unresolved: ${attr.decl.$refText}`);
        }

        const filledParams = new Set<AttributeParam>();

        for (const arg of attr.args) {
            let paramDecl: AttributeParam | undefined;
            if (!arg.name) {
                paramDecl = decl.params.find(
                    (p) => p.default && !filledParams.has(p)
                );
                if (!paramDecl) {
                    accept('error', `Unexpected unnamed argument`, {
                        node: arg,
                    });
                    return false;
                }
            } else {
                paramDecl = decl.params.find((p) => p.name === arg.name);
                if (!paramDecl) {
                    accept(
                        'error',
                        `Attribute "${decl.name}" doesn't have a parameter named "${arg.name}"`,
                        {
                            node: arg,
                        }
                    );
                    return false;
                }
            }

            if (!assignableToAttributeParam(arg, paramDecl, attr)) {
                accept('error', `Value is not assignable to parameter`, {
                    node: arg,
                });
                return false;
            }

            if (filledParams.has(paramDecl)) {
                accept(
                    'error',
                    `Parameter "${paramDecl.name}" is already provided`,
                    { node: arg }
                );
                return false;
            }
            filledParams.add(paramDecl);
        }

        const missingParams = decl.params.filter(
            (p) => !p.type.optional && !filledParams.has(p)
        );
        if (missingParams.length > 0) {
            accept(
                'error',
                `Required ${pluralize(
                    'parameter',
                    missingParams.length
                )} not provided: ${missingParams
                    .map((p) => p.name)
                    .join(', ')}`,
                { node: attr }
            );
            return false;
        }

        return true;
    }
}
