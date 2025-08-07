import {
    getModelFieldsWithBases,
    isDelegateModel,
    isForeignKeyField,
    isIdField,
    isRelationshipField,
} from '@zenstackhq/sdk';
import { DataModel, DataModelField, isDataModel, isTypeDef, Model, TypeDef } from '@zenstackhq/sdk/ast';

export default class MermaidGenerator {
    constructor(private model: Model) {}

    generate(dataModel: DataModel) {
        const allFields = getModelFieldsWithBases(dataModel);

        const fields = allFields
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

        const relations = allFields
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

        const jsonFields = allFields
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

    // Generate a comprehensive ER diagram with all models and their relationships
    generateComprehensive(): string {
        console.log('Generating comprehensive ER diagram...');

        const dataModels = this.model.declarations.filter((x) => isDataModel(x) && !x.isAbstract) as DataModel[];

        if (dataModels.length === 0) {
            return '```mermaid\nerDiagram\n```';
        }

        // Generate entities
        const entities = dataModels
            .map((model) => {
                const allFields = getModelFieldsWithBases(model);
                const fields = allFields
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

                return `"${model.name}" {\n${fields}\n}`;
            })
            .join('\n');

        // Collect all relationships
        const relationships = new Set<string>();
        dataModels.forEach((model) => {
            const allFields = getModelFieldsWithBases(model);
            allFields
                .filter((x) => isRelationshipField(x))
                .forEach((x) => {
                    const oppositeModelName = (x.type.reference!.ref as DataModel).name;
                    const oppositeModel = dataModels.find((m) => m.name === oppositeModelName);

                    if (oppositeModel) {
                        const oppositeField = oppositeModel.fields.find(
                            (field) => field.type.reference?.ref?.name === model.name
                        );

                        if (oppositeField) {
                            const currentType = x.type;
                            const oppositeType = oppositeField.type;

                            let relation = '';
                            if (currentType.array && oppositeType.array) {
                                relation = '}o--o{';
                            } else if (currentType.array && !oppositeType.array) {
                                relation = '||--o{';
                            } else if (!currentType.array && oppositeType.array) {
                                relation = '}o--||';
                            } else {
                                relation = currentType.optional ? '||--o|' : '|o--||';
                            }
                            relationships.add(`"${model.name}" ${relation} "${oppositeModelName}": ${x.name}`);
                        }
                    }
                });
        });

        return ['```mermaid', 'erDiagram', entities, Array.from(relationships).join('\n'), '```'].join('\n');
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
