import {
    ArrayExpr,
    DataModel,
    DataModelAttribute,
    DataModelField,
    isArrayExpr,
    isBooleanLiteral,
    isDataModel,
    isInvocationExpr,
    isNumberLiteral,
    isReferenceExpr,
    isStringLiteral,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import type { RuntimeAttribute } from '@zenstackhq/runtime';
import { streamAst } from 'langium';
import { lowerCaseFirst } from 'lower-case-first';
import { CodeBlockWriter, Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import {
    ExpressionContext,
    getAttribute,
    getAttributeArg,
    getAttributeArgLiteral,
    getAttributeArgs,
    getAuthModel,
    getDataModels,
    getInheritedFromDelegate,
    getLiteral,
    getRelationField,
    hasAttribute,
    isAuthInvocation,
    isEnumFieldReference,
    isForeignKeyField,
    isIdField,
    resolved,
    TypeScriptExpressionTransformer,
} from '.';

/**
 * Options for generating model metadata
 */
export type ModelMetaGeneratorOptions = {
    /**
     * Output directory
     */
    output: string;

    /**
     * Whether to generate all attributes
     */
    generateAttributes: boolean;

    /**
     * Whether to preserve the pre-compilation TypeScript files
     */
    preserveTsFiles?: boolean;
};

export async function generate(project: Project, models: DataModel[], options: ModelMetaGeneratorOptions) {
    const sf = project.createSourceFile(options.output, undefined, { overwrite: true });
    sf.addStatements('/* eslint-disable */');
    sf.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [
            { name: 'metadata', initializer: (writer) => generateModelMetadata(models, sf, writer, options) },
        ],
    });
    sf.addStatements('export default metadata;');

    if (options.preserveTsFiles) {
        await sf.save();
    }

    return sf;
}

function generateModelMetadata(
    dataModels: DataModel[],
    sourceFile: SourceFile,
    writer: CodeBlockWriter,
    options: ModelMetaGeneratorOptions
) {
    writer.block(() => {
        writeModels(sourceFile, writer, dataModels, options);
        writeDeleteCascade(writer, dataModels);
        writeAuthModel(writer, dataModels);
    });
}

function writeModels(
    sourceFile: SourceFile,
    writer: CodeBlockWriter,
    dataModels: DataModel[],
    options: ModelMetaGeneratorOptions
) {
    writer.write('models:');
    writer.block(() => {
        for (const model of dataModels) {
            writer.write(`${lowerCaseFirst(model.name)}:`);
            writer.block(() => {
                writer.write(`name: '${model.name}',`);
                writeBaseTypes(writer, model);
                writeFields(sourceFile, writer, model, options);
                writeUniqueConstraints(writer, model);
                if (options.generateAttributes) {
                    writeModelAttributes(writer, model);
                }
                writeDiscriminator(writer, model);
            });
            writer.writeLine(',');
        }
    });
    writer.writeLine(',');
}

function writeBaseTypes(writer: CodeBlockWriter, model: DataModel) {
    if (model.superTypes.length > 0) {
        writer.write('baseTypes: [');
        writer.write(model.superTypes.map((t) => `'${t.ref?.name}'`).join(', '));
        writer.write('],');
    }
}

function writeAuthModel(writer: CodeBlockWriter, dataModels: DataModel[]) {
    const authModel = getAuthModel(dataModels);
    if (authModel) {
        writer.writeLine(`authModel: '${authModel.name}'`);
    }
}

function writeDeleteCascade(writer: CodeBlockWriter, dataModels: DataModel[]) {
    writer.write('deleteCascade:');
    writer.block(() => {
        for (const model of dataModels) {
            const cascades = getDeleteCascades(model);
            if (cascades.length > 0) {
                writer.writeLine(`${lowerCaseFirst(model.name)}: [${cascades.map((n) => `'${n}'`).join(', ')}],`);
            }
        }
    });
    writer.writeLine(',');
}

function writeUniqueConstraints(writer: CodeBlockWriter, model: DataModel) {
    const constraints = getUniqueConstraints(model);
    if (constraints.length > 0) {
        writer.write('uniqueConstraints:');
        writer.block(() => {
            for (const constraint of constraints) {
                writer.write(`${constraint.name}: {
                                name: "${constraint.name}",
                                fields: ${JSON.stringify(constraint.fields)}
                            },`);
            }
        });
        writer.write(',');
    }
}

function writeModelAttributes(writer: CodeBlockWriter, model: DataModel) {
    const attrs = getAttributes(model);
    if (attrs.length > 0) {
        writer.write(`
attributes: ${JSON.stringify(attrs)},`);
    }
}

function writeDiscriminator(writer: CodeBlockWriter, model: DataModel) {
    const delegateAttr = getAttribute(model, '@@delegate');
    if (!delegateAttr) {
        return;
    }
    const discriminator = getAttributeArg(delegateAttr, 'discriminator') as ReferenceExpr;
    if (!discriminator) {
        return;
    }
    if (discriminator) {
        writer.write(`discriminator: ${JSON.stringify(discriminator.target.$refText)},`);
    }
}

function writeFields(
    sourceFile: SourceFile,
    writer: CodeBlockWriter,
    model: DataModel,
    options: ModelMetaGeneratorOptions
) {
    writer.write('fields:');
    writer.block(() => {
        for (const f of model.fields) {
            const backlink = getBackLink(f);
            const fkMapping = generateForeignKeyMapping(f);
            writer.write(`${f.name}: {`);

            writer.write(`
        name: "${f.name}",
        type: "${
            f.type.reference
                ? f.type.reference.$refText
                : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                  f.type.type!
        }",`);

            if (isIdField(f)) {
                writer.write(`
        isId: true,`);
            }

            if (isDataModel(f.type.reference?.ref)) {
                writer.write(`
        isDataModel: true,`);
            }

            if (f.type.array) {
                writer.write(`
        isArray: true,`);
            }

            if (f.type.optional) {
                writer.write(`
        isOptional: true,`);
            }

            if (options.generateAttributes) {
                const attrs = getAttributes(f);
                if (attrs.length > 0) {
                    writer.write(`
        attributes: ${JSON.stringify(attrs)},`);
                }
            } else {
                // only include essential attributes
                const attrs = getAttributes(f).filter((attr) => ['@default', '@updatedAt'].includes(attr.name));
                if (attrs.length > 0) {
                    writer.write(`
        attributes: ${JSON.stringify(attrs)},`);
                }
            }

            if (backlink) {
                writer.write(`
        backLink: '${backlink.name}',`);
            }

            if (isRelationOwner(f, backlink)) {
                writer.write(`
        isRelationOwner: true,`);
            }

            if (isForeignKeyField(f)) {
                writer.write(`
        isForeignKey: true,`);
                const relationField = getRelationField(f);
                if (relationField) {
                    writer.write(`
        relationField: '${relationField.name}',`);
                }
            }

            if (fkMapping && Object.keys(fkMapping).length > 0) {
                writer.write(`
        foreignKeyMapping: ${JSON.stringify(fkMapping)},`);
            }

            const defaultValueProvider = generateDefaultValueProvider(f, sourceFile);
            if (defaultValueProvider) {
                writer.write(`
                defaultValueProvider: ${defaultValueProvider},`);
            }

            const inheritedFromDelegate = getInheritedFromDelegate(f);
            if (inheritedFromDelegate && !isIdField(f)) {
                writer.write(`
        inheritedFrom: ${JSON.stringify(inheritedFromDelegate.name)},`);
            }

            if (isAutoIncrement(f)) {
                writer.write(`
        isAutoIncrement: true,`);
            }

            writer.write(`
    },`);
        }
    });
    writer.write(',');
}

function getBackLink(field: DataModelField) {
    if (!field.type.reference?.ref || !isDataModel(field.type.reference?.ref)) {
        return undefined;
    }

    const relName = getRelationName(field);

    const sourceModel = field.$container as DataModel;
    const targetModel = field.type.reference.ref as DataModel;

    for (const otherField of targetModel.fields) {
        if (otherField === field) {
            // backlink field is never self
            continue;
        }
        if (otherField.type.reference?.ref === sourceModel) {
            if (relName) {
                const otherRelName = getRelationName(otherField);
                if (relName === otherRelName) {
                    return otherField;
                }
            } else {
                return otherField;
            }
        }
    }
    return undefined;
}

function getRelationName(field: DataModelField) {
    const relAttr = getAttribute(field, '@relation');
    if (!relAttr) {
        return undefined;
    }
    return getAttributeArgLiteral(relAttr, 'name');
}

function getAttributes(target: DataModelField | DataModel): RuntimeAttribute[] {
    return target.attributes
        .map((attr) => {
            const args: Array<{ name?: string; value: unknown }> = [];
            for (const arg of attr.args) {
                if (isNumberLiteral(arg.value)) {
                    let v = parseInt(arg.value.value);
                    if (isNaN(v)) {
                        v = parseFloat(arg.value.value);
                    }
                    if (isNaN(v)) {
                        throw new Error(`Invalid number literal: ${arg.value.value}`);
                    }
                    args.push({ name: arg.name, value: v });
                } else if (isStringLiteral(arg.value) || isBooleanLiteral(arg.value)) {
                    args.push({ name: arg.name, value: arg.value.value });
                } else {
                    // non-literal args are ignored
                }
            }
            return { name: resolved(attr.decl).name, args };
        })
        .filter((d): d is RuntimeAttribute => !!d);
}

function getUniqueConstraints(model: DataModel) {
    const constraints: Array<{ name: string; fields: string[] }> = [];

    const extractConstraint = (attr: DataModelAttribute) => {
        const argsMap = getAttributeArgs(attr);
        if (argsMap.fields) {
            const fieldNames = (argsMap.fields as ArrayExpr).items.map(
                (item) => resolved((item as ReferenceExpr).target).name
            );
            let constraintName = argsMap.name && getLiteral<string>(argsMap.name);
            if (!constraintName) {
                // default constraint name is fields concatenated with underscores
                constraintName = fieldNames.join('_');
            }
            return { name: constraintName, fields: fieldNames };
        } else {
            return undefined;
        }
    };

    const addConstraint = (constraint: { name: string; fields: string[] }) => {
        if (!constraints.some((c) => c.name === constraint.name)) {
            constraints.push(constraint);
        }
    };

    // field-level @id first
    for (const field of model.fields) {
        if (hasAttribute(field, '@id')) {
            addConstraint({ name: field.name, fields: [field.name] });
        }
    }

    // then model-level @@id
    for (const attr of model.attributes.filter((attr) => attr.decl.ref?.name === '@@id')) {
        const constraint = extractConstraint(attr);
        if (constraint) {
            addConstraint(constraint);
        }
    }

    // then field-level @unique
    for (const field of model.fields) {
        if (hasAttribute(field, '@unique')) {
            addConstraint({ name: field.name, fields: [field.name] });
        }
    }

    // then model-level @@unique
    for (const attr of model.attributes.filter((attr) => attr.decl.ref?.name === '@@unique')) {
        const constraint = extractConstraint(attr);
        if (constraint) {
            addConstraint(constraint);
        }
    }

    return constraints;
}

function isRelationOwner(field: DataModelField, backLink: DataModelField | undefined) {
    if (!isDataModel(field.type.reference?.ref)) {
        return false;
    }

    if (!backLink) {
        // CHECKME: can this really happen?
        return true;
    }

    if (!hasAttribute(field, '@relation') && !hasAttribute(backLink, '@relation')) {
        // if neither side has `@relation` attribute, it's an implicit many-to-many relation,
        // both sides are owners
        return true;
    }

    return holdsForeignKey(field);
}

function holdsForeignKey(field: DataModelField) {
    const relation = field.attributes.find((attr) => attr.decl.ref?.name === '@relation');
    if (!relation) {
        return false;
    }
    const fields = getAttributeArg(relation, 'fields');
    return !!fields;
}

function generateForeignKeyMapping(field: DataModelField) {
    const relation = field.attributes.find((attr) => attr.decl.ref?.name === '@relation');
    if (!relation) {
        return undefined;
    }
    const fields = getAttributeArg(relation, 'fields');
    const references = getAttributeArg(relation, 'references');
    if (!isArrayExpr(fields) || !isArrayExpr(references) || fields.items.length !== references.items.length) {
        return undefined;
    }

    const fieldNames = fields.items.map((item) => (isReferenceExpr(item) ? item.target.$refText : undefined));
    const referenceNames = references.items.map((item) => (isReferenceExpr(item) ? item.target.$refText : undefined));

    const result: Record<string, string> = {};
    referenceNames.forEach((name, i) => {
        if (name) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[name] = fieldNames[i]!;
        }
    });
    return result;
}

function getDeleteCascades(model: DataModel): string[] {
    const allModels = getDataModels(model.$container);
    return allModels
        .filter((m) => {
            if (m === model) {
                return false;
            }
            const relationFields = m.fields.filter((f) => {
                if (f.type.reference?.ref !== model) {
                    return false;
                }
                const relationAttr = getAttribute(f, '@relation');
                if (relationAttr) {
                    const onDelete = getAttributeArg(relationAttr, 'onDelete');
                    if (onDelete && isEnumFieldReference(onDelete) && onDelete.target.ref?.name === 'Cascade') {
                        return true;
                    }
                }
                return false;
            });
            return relationFields.length > 0;
        })
        .map((m) => m.name);
}

function generateDefaultValueProvider(field: DataModelField, sourceFile: SourceFile) {
    const defaultAttr = getAttribute(field, '@default');
    if (!defaultAttr) {
        return undefined;
    }

    const expr = defaultAttr.args[0]?.value;
    if (!expr) {
        return undefined;
    }

    // find `auth()` in default value expression
    const hasAuth = streamAst(expr).some(isAuthInvocation);
    if (!hasAuth) {
        return undefined;
    }

    // generates a provider function like:
    //     function $default$Model$field(user: any) { ... }
    const func = sourceFile.addFunction({
        name: `$default$${field.$container.name}$${field.name}`,
        parameters: [{ name: 'user', type: 'any' }],
        returnType: 'unknown',
        statements: (writer) => {
            const tsWriter = new TypeScriptExpressionTransformer({ context: ExpressionContext.DefaultValue });
            const code = tsWriter.transform(expr, false);
            writer.write(`return ${code};`);
        },
    });

    return func.getName();
}

function isAutoIncrement(field: DataModelField) {
    const defaultAttr = getAttribute(field, '@default');
    if (!defaultAttr) {
        return false;
    }

    const arg = defaultAttr.args[0]?.value;
    if (!arg) {
        return false;
    }

    return isInvocationExpr(arg) && arg.function.$refText === 'autoincrement';
}
