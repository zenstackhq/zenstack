import { isDelegateModel, isForeignKeyField, isIdField, isRelationshipField } from '@zenstackhq/sdk';
import { DataModel, DataModelField, isDataModel, isTypeDef, Model, TypeDef } from '@zenstackhq/sdk/ast';

export default class MermaidGenerator {
    constructor(private model: Model) {}

    generate(dataModel: DataModel) {
        const fields = dataModel.fields
            .filter((x) => !isRelationshipField(x) && !isTypeDef(x.type.reference?.ref))
            .map((x) => {
                return [
                    x.type.type || x.type.reference?.ref?.name,
                    x.name,
                    isIdField(x) ? 'PK' : isForeignKeyField(x) ? 'FK' : '',
                    x.type.optional ? '"?"' : '',
                ].join(' ');
            })
            .map((x) => `  ${x}`)
            .join('\n');

        const relations = dataModel.fields
            .filter((x) => isRelationshipField(x))
            .map((x) => {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const oppositeModelName = (x.type.reference!.ref as DataModel).name;

                const oppositeModel = this.model.declarations.find(
                    (y) => isDataModel(y) && y.name === oppositeModelName
                ) as DataModel;

                const oppositeField = oppositeModel.fields.find(
                    (x) => x.type.reference?.ref?.name == dataModel.name
                ) as DataModelField;

                let relation = '';

                if (oppositeField) {
                    const currentType = x.type;
                    const oppositeType = oppositeField.type;

                    if (currentType.array && oppositeType.array) {
                        //many to many
                        relation = '}o--o{';
                    } else if (currentType.array && !oppositeType.array) {
                        //one to many
                        relation = '||--o{';
                    } else if (!currentType.array && oppositeType.array) {
                        //many to one
                        relation = '}o--||';
                    } else {
                        //one to one
                        relation = currentType.optional ? '||--o|' : '|o--||';
                    }
                    return [`"${dataModel.name}"`, relation, `"${oppositeField.$container.name}": ${x.name}`].join(' ');
                } else {
                    // ignore polymorphic relations
                    return [`"${dataModel.name}"`, relation].join(' ');
                }
            })
            .join('\n');

        const jsonFields = dataModel.fields
            .filter((x) => isTypeDef(x.type.reference?.ref))
            .map((x) => {
                return this.generateTypeDef(x.type.reference?.ref as TypeDef, x.name, dataModel.name, new Set());
            })
            .join('\n');

        let delegateInfo = '';
        if (dataModel.superTypes.length == 1 && isDelegateModel(dataModel.superTypes[0].ref as DataModel)) {
            const delegateModel = dataModel.superTypes[0].ref as DataModel;

            delegateInfo = [
                `"${delegateModel.name}" {} \n"${delegateModel.name}" ||--|| "${dataModel.name}": delegates`,
            ].join('\n');
        }

        return [
            '```mermaid',
            'erDiagram',
            `"${dataModel.name}" {\n${fields}\n}`,
            delegateInfo,
            relations,
            jsonFields,
            '```',
        ].join('\n');
    }

    generateTypeDef(
        typeDef: TypeDef,
        fieldName: string,
        relatedEntityName: string,
        visited: Set<string> = new Set()
    ): string {
        // Check if this TypeDef has already been visited to prevent infinite recursion
        if (visited.has(typeDef.name)) {
            return '';
        }

        // Add current TypeDef to visited set
        visited.add(typeDef.name);

        const fields = typeDef.fields
            .filter((x) => !isTypeDef(x.type.reference?.ref))
            .map((x) => {
                return [x.type.type || x.type.reference?.ref?.name, x.name, x.type.optional ? '"?"' : ''].join(' ');
            })
            .map((x) => `  ${x}`)
            .join('\n');

        const jsonFields = typeDef.fields
            .filter((x) => isTypeDef(x.type.reference?.ref))
            .map((x) => this.generateTypeDef(x.type.reference?.ref as TypeDef, x.name, typeDef.name, visited))
            .join('\n');

        return [
            `"${typeDef.name}" {\n${fields}\n} \n"${relatedEntityName}" ||--|| "${typeDef.name}": ${fieldName}`,
            jsonFields,
        ].join('\n');
    }
}
