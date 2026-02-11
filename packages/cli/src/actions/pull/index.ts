import type { ZModelServices } from '@zenstackhq/language';
import colors from 'colors';
import {
    isEnum,
    type DataField,
    type DataModel,
    type Enum,
    type Model,
} from '@zenstackhq/language/ast';
import {
    DataFieldAttributeFactory,
    DataFieldFactory,
    DataModelFactory,
    EnumFactory,
} from '@zenstackhq/language/factory';
import { AstUtils, type Reference, type AstNode, type CstNode } from 'langium';
import { lowerCaseFirst } from '@zenstackhq/common-helpers';
import type { PullOptions } from '../db';
import type { Cascade, IntrospectedEnum, IntrospectedTable, IntrospectionProvider } from './provider';
import { getAttributeRef, getDbName, getEnumRef } from './utils';
import { resolveNameCasing } from './casing';
import { CliError } from '../../cli-error';

export function syncEnums({
    dbEnums,
    model,
    oldModel,
    provider,
    options,
    services,
    defaultSchema,
}: {
    dbEnums: IntrospectedEnum[];
    model: Model;
    oldModel: Model;
    provider: IntrospectionProvider;
    services: ZModelServices;
    options: PullOptions;
    defaultSchema: string;
}) {
    if (provider.isSupportedFeature('NativeEnum')) {
        for (const dbEnum of dbEnums) {
            const { modified, name } = resolveNameCasing(options.modelCasing, dbEnum.enum_type);
            if (modified) console.log(colors.gray(`Mapping enum ${dbEnum.enum_type} to ${name}`));
            const factory = new EnumFactory().setName(name);
            if (modified || options.alwaysMap)
                factory.addAttribute((builder) =>
                    builder
                        .setDecl(getAttributeRef('@@map', services))
                        .addArg((argBuilder) => argBuilder.StringLiteral.setValue(dbEnum.enum_type)),
                );

            dbEnum.values.forEach((v) => {
                const { name, modified } = resolveNameCasing(options.fieldCasing, v);
                factory.addField((builder) => {
                    builder.setName(name);
                    if (modified || options.alwaysMap)
                        builder.addAttribute((builder) =>
                            builder
                                .setDecl(getAttributeRef('@map', services))
                                .addArg((argBuilder) => argBuilder.StringLiteral.setValue(v)),
                        );

                    return builder;
                });
            });

            if (dbEnum.schema_name && dbEnum.schema_name !== '' && dbEnum.schema_name !== defaultSchema) {
                factory.addAttribute((b) =>
                    b
                        .setDecl(getAttributeRef('@@schema', services))
                        .addArg((a) => a.StringLiteral.setValue(dbEnum.schema_name)),
                );
            }

            model.declarations.push(factory.get({ $container: model }));
        }
    } else {
        // For providers that don't support native enums (e.g., SQLite), carry over
        // enum declarations from the existing schema as-is by deep-cloning the AST nodes.
        // A dummy buildReference is used since we don't need cross-reference resolution.
        const dummyBuildReference = (_node: AstNode, _property: string, _refNode: CstNode | undefined, refText: string): Reference<AstNode> =>
            ({ $refText: refText }) as Reference<AstNode>;

        oldModel.declarations
            .filter((d) => isEnum(d))
            .forEach((d) => {
                const copy = AstUtils.copyAstNode(d, dummyBuildReference);
                (copy as { $container: unknown }).$container = model;
                model.declarations.push(copy);
            });
    }
}

export type Relation = {
    schema: string;
    table: string;
    columns: string[];
    type: 'one' | 'many';
    fk_name: string;
    foreign_key_on_update: Cascade;
    foreign_key_on_delete: Cascade;
    nullable: boolean;
    references: {
        schema: string | null;
        table: string | null;
        columns: (string | null)[];
        type: 'one' | 'many';
    };
};

export function syncTable({
    model,
    provider,
    table,
    services,
    options,
    defaultSchema,
}: {
    table: IntrospectedTable;
    model: Model;
    oldModel: Model;
    provider: IntrospectionProvider;
    services: ZModelServices;
    options: PullOptions;
    defaultSchema: string;
}) {
    const idAttribute = getAttributeRef('@id', services);
    const modelIdAttribute = getAttributeRef('@@id', services);
    const uniqueAttribute = getAttributeRef('@unique', services);
    const modelUniqueAttribute = getAttributeRef('@@unique', services);
    const fieldMapAttribute = getAttributeRef('@map', services);
    const tableMapAttribute = getAttributeRef('@@map', services);
    const modelindexAttribute = getAttributeRef('@@index', services);

    const relations: Relation[] = [];
    const { name, modified } = resolveNameCasing(options.modelCasing, table.name);
    const multiPk = table.columns.filter((c) => c.pk).length > 1;

    const modelFactory = new DataModelFactory().setName(name).setIsView(table.type === 'view');
    modelFactory.setContainer(model);

    if (modified || options.alwaysMap) {
        modelFactory.addAttribute((builder) =>
            builder.setDecl(tableMapAttribute).addArg((argBuilder) => argBuilder.StringLiteral.setValue(table.name)),
        );
    }
    // Group FK columns by constraint name to handle composite foreign keys.
    // Each FK constraint (identified by fk_name) may span multiple columns.
    const fkGroups = new Map<string, typeof table.columns>();
    table.columns.forEach((column) => {
        if (column.foreign_key_table && column.foreign_key_name) {
            const group = fkGroups.get(column.foreign_key_name) ?? [];
            group.push(column);
            fkGroups.set(column.foreign_key_name, group);
        }
    });

    for (const [fkName, fkColumns] of fkGroups) {
        const firstCol = fkColumns[0]!;
        // For single-column FKs, check if the column is the table's single-column PK (one-to-one)
        const isSingleColumnPk = fkColumns.length === 1 && !multiPk && firstCol.pk;
        // A single-column FK with unique constraint means one-to-one on the opposite side
        const isUniqueRelation = (fkColumns.length === 1 && firstCol.unique) || isSingleColumnPk;
        relations.push({
            schema: table.schema,
            table: table.name,
            columns: fkColumns.map((c) => c.name),
            type: 'one',
            fk_name: fkName,
            foreign_key_on_delete: firstCol.foreign_key_on_delete,
            foreign_key_on_update: firstCol.foreign_key_on_update,
            nullable: firstCol.nullable,
            references: {
                schema: firstCol.foreign_key_schema,
                table: firstCol.foreign_key_table,
                columns: fkColumns.map((c) => c.foreign_key_column),
                type: isUniqueRelation ? 'one' : 'many',
            },
        });
    }

    table.columns.forEach((column) => {

        const { name, modified } = resolveNameCasing(options.fieldCasing, column.name);

        const builtinType = provider.getBuiltinType(column.datatype);

        modelFactory.addField((builder) => {
            builder.setName(name);
            builder.setType((typeBuilder) => {
                typeBuilder.setArray(builtinType.isArray);
                // Array fields cannot be optional (Prisma/ZenStack limitation)
                typeBuilder.setOptional(builtinType.isArray ? false : column.nullable);

                if (column.computed) {
                    // Generated/computed columns (e.g., GENERATED ALWAYS AS ... STORED/VIRTUAL)
                    // are read-only and must be rendered as Unsupported("full type definition").
                    // The datatype contains the full DDL type definition including the expression.
                    typeBuilder.setUnsupported((unsupportedBuilder) =>
                        unsupportedBuilder.setValue((lt) => lt.StringLiteral.setValue(column.datatype)),
                    );
                } else if (column.datatype === 'enum') {
                    const ref = model.declarations.find((d) => isEnum(d) && getDbName(d) === column.datatype_name) as
                        | Enum
                        | undefined;

                    if (!ref) {
                        throw new CliError(`Enum ${column.datatype_name} not found`);
                    }
                    typeBuilder.setReference(ref);
                } else {
                    if (builtinType.type !== 'Unsupported') {
                        typeBuilder.setType(builtinType.type);
                    } else {
                        typeBuilder.setUnsupported((unsupportedBuilder) =>
                            unsupportedBuilder.setValue((lt) => lt.StringLiteral.setValue(column.datatype)),
                        );
                    }
                }

                return typeBuilder;
            });

            if (column.pk && !multiPk) {
                builder.addAttribute((b) => b.setDecl(idAttribute));
            }

            // Add field-type-based attributes (e.g., @updatedAt for DateTime fields, @db.* attributes)
            const fieldAttrs = provider.getFieldAttributes({
                fieldName: column.name,
                fieldType: builtinType.type,
                datatype: column.datatype,
                length: column.length,
                precision: column.precision,
                services,
            });
            fieldAttrs.forEach(builder.addAttribute.bind(builder));

            if (column.default && !column.computed) {
                const defaultExprBuilder = provider.getDefaultValue({
                    fieldType: builtinType.type,
                    datatype: column.datatype,
                    datatype_name: column.datatype_name,
                    defaultValue: column.default,
                    services,
                    enums: model.declarations.filter((d) => d.$type === 'Enum') as Enum[],
                });
                if (defaultExprBuilder) {
                    const defaultAttr = new DataFieldAttributeFactory()
                        .setDecl(getAttributeRef('@default', services))
                        .addArg(defaultExprBuilder);
                    builder.addAttribute(defaultAttr);
                }
            }

            if (column.unique && !column.pk) {
                builder.addAttribute((b) => {
                    b.setDecl(uniqueAttribute);
                    // Only add map if the unique constraint name differs from default patterns
                    // Default patterns: TableName_columnName_key (Prisma) or just columnName (MySQL)
                    const isDefaultName = !column.unique_name
                        || column.unique_name === `${table.name}_${column.name}_key`
                        || column.unique_name === column.name;
                    if (!isDefaultName) {
                        b.addArg((ab) => ab.StringLiteral.setValue(column.unique_name!), 'map');
                    }

                    return b;
                });
            }
            if (modified || options.alwaysMap) {
                builder.addAttribute((ab) =>
                    ab.setDecl(fieldMapAttribute).addArg((ab) => ab.StringLiteral.setValue(column.name)),
                );
            }

            return builder;
        });
    });

    const pkColumns = table.columns.filter((c) => c.pk).map((c) => c.name);
    if (multiPk) {
        modelFactory.addAttribute((builder) =>
            builder.setDecl(modelIdAttribute).addArg((argBuilder) => {
                const arrayExpr = argBuilder.ArrayExpr;
                pkColumns.forEach((c) => {
                    const ref = modelFactory.node.fields.find((f) => getDbName(f) === c);
                    if (!ref) {
                        throw new CliError(`Field ${c} not found`);
                    }
                    arrayExpr.addItem((itemBuilder) => itemBuilder.ReferenceExpr.setTarget(ref));
                });
                return arrayExpr;
            }),
        );
    }

    const hasUniqueConstraint =
        table.columns.some((c) => c.unique || c.pk) ||
        table.indexes.some((i) => i.unique);
    if (!hasUniqueConstraint) {
        modelFactory.addAttribute((a) => a.setDecl(getAttributeRef('@@ignore', services)));
        modelFactory.addComment(
            '/// The underlying table does not contain a valid unique identifier and can therefore currently not be handled by Zenstack Client.',
        );
    }

    // Sort indexes: unique indexes first, then other indexes
    const sortedIndexes = table.indexes.reverse().sort((a, b) => {
        if (a.unique && !b.unique) return -1;
        if (!a.unique && b.unique) return 1;
        return 0;
    });

    sortedIndexes.forEach((index) => {
        if (index.predicate) {
            //These constraints are not supported by Zenstack, because Zenstack currently does not fully support check constraints. Read more: https://pris.ly/d/check-constraints
            console.warn(
                colors.yellow(
                    `These constraints are not supported by Zenstack. Read more: https://pris.ly/d/check-constraints\n- Model: "${table.name}", constraint: "${index.name}"`,
                ),
            );
            return;
        }
        if (index.columns.find((c) => c.expression)) {
            console.warn(
                colors.yellow(
                    `These constraints are not supported by Zenstack. Read more: https://pris.ly/d/check-constraints\n- Model: "${table.name}", constraint: "${index.name}"`,
                ),
            );
            return;
        }

        // Skip PRIMARY key index (handled via @id or @@id)
        if (index.primary) {
            return;
        }

        // Skip single-column indexes that are already handled by @id or @unique on the field
        if (index.columns.length === 1 && (index.columns.find((c) => pkColumns.includes(c.name)) || index.unique)) {
            return;
        }

        modelFactory.addAttribute((builder) =>
        {
            const attr = builder
                .setDecl(index.unique ? modelUniqueAttribute : modelindexAttribute)
                .addArg((argBuilder) => {
                    const arrayExpr = argBuilder.ArrayExpr;
                    index.columns.forEach((c) => {
                        const ref = modelFactory.node.fields.find((f) => getDbName(f) === c.name);
                        if (!ref) {
                            throw new CliError(`Column ${c.name} not found in model ${table.name}`);
                        }
                        arrayExpr.addItem((itemBuilder) => {
                            const refExpr = itemBuilder.ReferenceExpr.setTarget(ref);
                            if (c.order && c.order !== 'ASC')
                                refExpr.addArg((ab) => ab.StringLiteral.setValue('DESC'), 'sort');

                            return refExpr;
                        });
                    });
                    return arrayExpr;
                });

                const suffix = index.unique ? '_key' : '_idx';

                if(index.name !== `${table.name}_${index.columns.map(c => c.name).join('_')}${suffix}`){
                    attr.addArg((argBuilder) => argBuilder.StringLiteral.setValue(index.name), 'map');
                }

            return attr
        }

        );
    });
    if (table.schema && table.schema !== '' && table.schema !== defaultSchema) {
        modelFactory.addAttribute((b) =>
            b.setDecl(getAttributeRef('@@schema', services)).addArg((a) => a.StringLiteral.setValue(table.schema)),
        );
    }

    model.declarations.push(modelFactory.node);
    return relations;
}

export function syncRelation({
    model,
    relation,
    services,
    options,
    selfRelation,
    similarRelations,
}: {
    model: Model;
    relation: Relation;
    services: ZModelServices;
    options: PullOptions;
    //self included
    similarRelations: number;
    selfRelation: boolean;
}) {
    const idAttribute = getAttributeRef('@id', services);
    const uniqueAttribute = getAttributeRef('@unique', services);
    const relationAttribute = getAttributeRef('@relation', services);
    const fieldMapAttribute = getAttributeRef('@map', services);
    const tableMapAttribute = getAttributeRef('@@map', services);

    const includeRelationName = selfRelation || similarRelations > 0;

    if (!idAttribute || !uniqueAttribute || !relationAttribute || !fieldMapAttribute || !tableMapAttribute) {
        throw new CliError('Cannot find required attributes in the model.');
    }

    const sourceModel = model.declarations.find((d) => d.$type === 'DataModel' && getDbName(d) === relation.table) as
        | DataModel
        | undefined;
    if (!sourceModel) return;

    // Resolve all source and target fields for the relation (supports composite FKs)
    const sourceFields: { field: DataField; index: number }[] = [];
    for (const colName of relation.columns) {
        const idx = sourceModel.fields.findIndex((f) => getDbName(f) === colName);
        const field = sourceModel.fields[idx] as DataField | undefined;
        if (!field) return;
        sourceFields.push({ field, index: idx });
    }

    const targetModel = model.declarations.find(
        (d) => d.$type === 'DataModel' && getDbName(d) === relation.references.table,
    ) as DataModel | undefined;
    if (!targetModel) return;

    const targetFields: DataField[] = [];
    for (const colName of relation.references.columns) {
        const field = targetModel.fields.find((f) => getDbName(f) === colName);
        if (!field) return;
        targetFields.push(field);
    }

    // Use the first source field for naming heuristics
    const firstSourceField = sourceFields[0]!.field;
    const firstSourceFieldId = sourceFields[0]!.index;
    const firstColumn = relation.columns[0]!;

    const fieldPrefix = /[0-9]/g.test(sourceModel.name.charAt(0)) ? '_' : '';

    const relationName = `${relation.table}${similarRelations > 0 ? `_${firstColumn}` : ''}To${relation.references.table}`;

    // Derive a relation field name from the FK scalar field: if the field ends with "Id",
    // strip the suffix and use the remainder (e.g., "authorId" -> "author").
    const sourceNameFromReference = firstSourceField.name.toLowerCase().endsWith('id') ? `${resolveNameCasing(options.fieldCasing, firstSourceField.name.slice(0, -2)).name}${relation.type === 'many'? 's' : ''}` : undefined;

    // Check if the derived name would clash with an existing field
    const sourceFieldFromReference = sourceModel.fields.find((f) => f.name === sourceNameFromReference);

    // Determine the relation field name:
    // - For ambiguous relations (multiple FKs to the same table), include the source column for disambiguation.
    // - Otherwise, prefer the name derived from the FK field (if no clash), falling back to the target model name.
    let { name: sourceFieldName } = resolveNameCasing(
        options.fieldCasing,
        similarRelations > 0
            ? `${fieldPrefix}${lowerCaseFirst(sourceModel.name)}_${firstColumn}`
            : `${(!sourceFieldFromReference? sourceNameFromReference : undefined) || lowerCaseFirst(resolveNameCasing(options.fieldCasing, targetModel.name).name)}${relation.type === 'many'? 's' : ''}`,
    );

    if (sourceModel.fields.find((f) => f.name === sourceFieldName)) {
        sourceFieldName = `${sourceFieldName}To${lowerCaseFirst(targetModel.name)}_${relation.references.columns[0]}`;
    }

    const sourceFieldFactory = new DataFieldFactory()
        .setContainer(sourceModel)
        .setName(sourceFieldName)
        .setType((tb) =>
            tb
                .setOptional(relation.nullable)
                .setArray(relation.type === 'many')
                .setReference(targetModel),
        );
    sourceFieldFactory.addAttribute((ab) => {
        ab.setDecl(relationAttribute);
        if (includeRelationName) ab.addArg((ab) => ab.StringLiteral.setValue(relationName));

        // Build fields array (all source FK columns)
        ab.addArg((ab) => {
            const arrayExpr = ab.ArrayExpr;
            for (const { field } of sourceFields) {
                arrayExpr.addItem((aeb) => aeb.ReferenceExpr.setTarget(field));
            }
            return arrayExpr;
        }, 'fields');

        // Build references array (all target columns)
        ab.addArg((ab) => {
            const arrayExpr = ab.ArrayExpr;
            for (const field of targetFields) {
                arrayExpr.addItem((aeb) => aeb.ReferenceExpr.setTarget(field));
            }
            return arrayExpr;
        }, 'references');

        // Prisma defaults: onDelete is SetNull for optional, Restrict for mandatory
        const onDeleteDefault = relation.nullable ? 'SET NULL' : 'RESTRICT';
        if (relation.foreign_key_on_delete && relation.foreign_key_on_delete !== onDeleteDefault) {
            const enumRef = getEnumRef('ReferentialAction', services);
            if (!enumRef) throw new CliError('ReferentialAction enum not found');
            const enumFieldRef = enumRef.fields.find(
                (f) => f.name.toLowerCase() === relation.foreign_key_on_delete!.replace(/ /g, '').toLowerCase(),
            );
            if (!enumFieldRef) throw new CliError(`ReferentialAction ${relation.foreign_key_on_delete} not found`);
            ab.addArg((a) => a.ReferenceExpr.setTarget(enumFieldRef), 'onDelete');
        }

        // Prisma default: onUpdate is Cascade
        if (relation.foreign_key_on_update && relation.foreign_key_on_update !== 'CASCADE') {
            const enumRef = getEnumRef('ReferentialAction', services);
            if (!enumRef) throw new CliError('ReferentialAction enum not found');
            const enumFieldRef = enumRef.fields.find(
                (f) => f.name.toLowerCase() === relation.foreign_key_on_update!.replace(/ /g, '').toLowerCase(),
            );
            if (!enumFieldRef) throw new CliError(`ReferentialAction ${relation.foreign_key_on_update} not found`);
            ab.addArg((a) => a.ReferenceExpr.setTarget(enumFieldRef), 'onUpdate');
        }

        // Check if the FK constraint name differs from the default pattern
        const defaultFkName = `${relation.table}_${relation.columns.join('_')}_fkey`;
        if (relation.fk_name && relation.fk_name !== defaultFkName) ab.addArg((ab) => ab.StringLiteral.setValue(relation.fk_name), 'map');

        return ab;
    });

    sourceModel.fields.splice(firstSourceFieldId, 0, sourceFieldFactory.node); // Insert the relation field before the first FK scalar field

    const oppositeFieldPrefix = /[0-9]/g.test(targetModel.name.charAt(0)) ? '_' : '';
    let { name: oppositeFieldName } = resolveNameCasing(
        options.fieldCasing,
        similarRelations > 0
            ? `${oppositeFieldPrefix}${lowerCaseFirst(sourceModel.name)}_${firstColumn}`
            : `${lowerCaseFirst(resolveNameCasing(options.fieldCasing, sourceModel.name).name)}${relation.references.type === 'many'? 's' : ''}`,
    );

    if (targetModel.fields.find((f) => f.name === oppositeFieldName)) {
        ({ name: oppositeFieldName } = resolveNameCasing(
            options.fieldCasing,
            `${lowerCaseFirst(sourceModel.name)}_${firstColumn}To${relation.references.table}_${relation.references.columns[0]}`,
        ));
    }

    const targetFieldFactory = new DataFieldFactory()
        .setContainer(targetModel)
        .setName(oppositeFieldName)
        .setType((tb) =>
            tb
                .setOptional(relation.references.type === 'one')
                .setArray(relation.references.type === 'many')
                .setReference(sourceModel),
        );
    if (includeRelationName)
        targetFieldFactory.addAttribute((ab) =>
            ab.setDecl(relationAttribute).addArg((ab) => ab.StringLiteral.setValue(relationName)),
        );

    targetModel.fields.push(targetFieldFactory.node);
}

/**
 * Consolidates per-column enums back to shared enums when possible.
 *
 * MySQL doesn't have named enum types — each column gets a synthetic enum
 * (e.g., `UserStatus`, `GroupStatus`). When the original schema used a shared
 * enum (e.g., `Status`) across multiple fields, this function detects the
 * mapping via field references and consolidates the synthetic enums back into
 * the original shared enum so the merge phase can match them correctly.
 */
export function consolidateEnums({
    newModel,
    oldModel,
}: {
    newModel: Model;
    oldModel: Model;
}) {
    const newEnums = newModel.declarations.filter((d) => isEnum(d)) as Enum[];
    const newDataModels = newModel.declarations.filter((d) => d.$type === 'DataModel') as DataModel[];
    const oldDataModels = oldModel.declarations.filter((d) => d.$type === 'DataModel') as DataModel[];

    // For each new enum, find which old enum it corresponds to (via field references)
    const enumMapping = new Map<Enum, Enum>(); // newEnum -> oldEnum

    for (const newEnum of newEnums) {
        for (const newDM of newDataModels) {
            for (const field of newDM.fields) {
                if (field.$type !== 'DataField' || field.type.reference?.ref !== newEnum) continue;

                // Find matching model in old model by db name
                const oldDM = oldDataModels.find((d) => getDbName(d) === getDbName(newDM));
                if (!oldDM) continue;

                // Find matching field in old model by db name
                const oldField = oldDM.fields.find((f) => getDbName(f) === getDbName(field));
                if (!oldField || oldField.$type !== 'DataField' || !oldField.type.reference?.ref) continue;

                const oldEnum = oldField.type.reference.ref;
                if (!isEnum(oldEnum)) continue;

                enumMapping.set(newEnum, oldEnum as Enum);
                break;
            }
            if (enumMapping.has(newEnum)) break;
        }
    }

    // Group by old enum: oldEnum -> [newEnum1, newEnum2, ...]
    const reverseMapping = new Map<Enum, Enum[]>();
    for (const [newEnum, oldEnum] of enumMapping) {
        if (!reverseMapping.has(oldEnum)) {
            reverseMapping.set(oldEnum, []);
        }
        reverseMapping.get(oldEnum)!.push(newEnum);
    }

    // Consolidate: when new enums map to the same old enum with matching values
    for (const [oldEnum, newEnumsGroup] of reverseMapping) {
        const keepEnum = newEnumsGroup[0]!;

        // Skip if already correct (single enum with matching name)
        if (newEnumsGroup.length === 1 && keepEnum.name === oldEnum.name) continue;

        // Check that all new enums have the same values as the old enum
        const oldValues = new Set(oldEnum.fields.map((f) => getDbName(f)));
        const allMatch = newEnumsGroup.every((ne) => {
            const newValues = new Set(ne.fields.map((f) => getDbName(f)));
            return oldValues.size === newValues.size && [...oldValues].every((v) => newValues.has(v));
        });

        if (!allMatch) continue;

        // Rename the kept enum to match the old shared name
        keepEnum.name = oldEnum.name;

        // Replace keepEnum's attributes with those from the old enum so that
        // any synthetic @@map added by syncEnums is removed and getDbName(keepEnum)
        // reflects the consolidated name rather than the stale per-column name.
        // Shallow-copy and re-parent so AST $container pointers reference keepEnum.
        keepEnum.attributes = oldEnum.attributes.map((attr) => {
            const copy = { ...attr, $container: keepEnum };
            return copy;
        });

        // Remove duplicate enums from newModel
        for (let i = 1; i < newEnumsGroup.length; i++) {
            const idx = newModel.declarations.indexOf(newEnumsGroup[i]!);
            if (idx >= 0) {
                newModel.declarations.splice(idx, 1);
            }
        }

        // Update all field references in newModel to point to the kept enum
        for (const newDM of newDataModels) {
            for (const field of newDM.fields) {
                if (field.$type !== 'DataField') continue;
                const ref = field.type.reference?.ref;
                if (ref && newEnumsGroup.includes(ref as Enum)) {
                    (field.type as any).reference = {
                        ref: keepEnum,
                        $refText: keepEnum.name,
                    };
                }
            }
        }

        console.log(
            colors.gray(
                `Consolidated enum${newEnumsGroup.length > 1 ? 's' : ''} ${newEnumsGroup.map((e) => e.name).join(', ')} → ${oldEnum.name}`,
            ),
        );
    }
}
