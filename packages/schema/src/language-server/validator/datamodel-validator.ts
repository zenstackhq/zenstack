import { SCALAR_TYPES } from '@lang/constants';
import { DataModel, DataModelField } from '@lang/generated/ast';
import { AstValidator } from '@lang/types';
import { ValidationAcceptor } from 'langium';
import { validateDuplicatedDeclarations } from './utils';

export default class DataModelValidator implements AstValidator<DataModel> {
    validate(dm: DataModel, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(dm.fields, accept);
        this.validateFields(dm, accept);
    }

    private validateFields(dm: DataModel, accept: ValidationAcceptor) {
        const idFields = dm.fields.filter((f) =>
            f.attributes.find((attr) => attr.decl.ref?.name === 'id')
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
    }
}
