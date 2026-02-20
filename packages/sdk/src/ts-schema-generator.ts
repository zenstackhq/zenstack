import { invariant } from '@zenstackhq/common-helpers';
import {
    ArrayExpr,
    AttributeArg,
    BinaryExpr,
    DataField,
    DataFieldAttribute,
    DataFieldType,
    DataModel,
    DataModelAttribute,
    Enum,
    Expression,
    InvocationExpr,
    isArrayExpr,
    isBinaryExpr,
    isCollectionPredicateBinding,
    isDataField,
    isDataModel,
    isDataSource,
    isEnum,
    isEnumField,
    isInvocationExpr,
    isLiteralExpr,
    isMemberAccessExpr,
    isNullExpr,
    isProcedure,
    isReferenceExpr,
    isThisExpr,
    isTypeDef,
    isUnaryExpr,
    LiteralExpr,
    MemberAccessExpr,
    Procedure,
    ReferenceExpr,
    TypeDef,
    UnaryExpr,
    type Model,
} from '@zenstackhq/language/ast';
import { getAllAttributes, getAllFields, getAttributeArg, isDataFieldReference } from '@zenstackhq/language/utils';
import fs from 'node:fs';
import path from 'node:path';
import { match } from 'ts-pattern';
import * as ts from 'typescript';
import { ModelUtils } from '.';
import {
    getAttribute,
    getAuthDecl,
    getIdFields,
    hasAttribute,
    isDelegateModel,
    isIdField,
    isUniqueField,
} from './model-utils';

export type TsSchemaGeneratorOptions = {
    outDir: string;
    lite?: boolean;
    liteOnly?: boolean;
    importWithFileExtension?: string;
    generateModelTypes?: boolean;
    generateInputTypes?: boolean;
};

export class TsSchemaGenerator {
    private usedExpressionUtils = false;

    async generate(model: Model, options: TsSchemaGeneratorOptions) {
        fs.mkdirSync(options.outDir, { recursive: true });

        // Reset the flag for each generation
        this.usedExpressionUtils = false;

        // the schema itself
        this.generateSchema(model, options);

        // the model types
        if (options.generateModelTypes !== false) {
            this.generateModelsAndTypeDefs(model, options);
        }

        // the input types
        if (options.generateInputTypes !== false) {
            this.generateInputTypes(model, options);
        }
    }

    private generateSchema(model: Model, options: TsSchemaGeneratorOptions) {
        const targets: { lite: boolean; file: string }[] = [];
        if (!options.liteOnly) {
            targets.push({ lite: false, file: 'schema.ts' });
        }
        if (options.lite || options.liteOnly) {
            targets.push({ lite: true, file: 'schema-lite.ts' });
        }

        for (const { lite, file } of targets) {
            const statements: ts.Statement[] = [];
            this.generateSchemaStatements(model, statements, lite);
            this.generateBannerComments(statements);

            const schemaOutputFile = path.join(options.outDir, file);
            const sourceFile = ts.createSourceFile(
                schemaOutputFile,
                '',
                ts.ScriptTarget.ESNext,
                false,
                ts.ScriptKind.TS,
            );
            const printer = ts.createPrinter();
            const result = printer.printList(
                ts.ListFormat.MultiLine,
                ts.factory.createNodeArray(statements),
                sourceFile,
            );
            fs.writeFileSync(schemaOutputFile, result);
        }
    }

    private generateSchemaStatements(model: Model, statements: ts.Statement[], lite: boolean) {
        // Generate schema content first to determine if ExpressionUtils is needed
        const schemaClass = this.createSchemaClass(model, lite);

        // Now generate the import declaration with the correct imports
        // import { type SchemaDef, ExpressionUtils } from '@zenstackhq/schema';
        const schemaImportDecl = ts.factory.createImportDeclaration(
            undefined,
            ts.factory.createImportClause(
                undefined,
                undefined,
                ts.factory.createNamedImports([
                    ts.factory.createImportSpecifier(true, undefined, ts.factory.createIdentifier('SchemaDef')),
                    ...(this.usedExpressionUtils
                        ? [
                              ts.factory.createImportSpecifier(
                                  false,
                                  undefined,
                                  ts.factory.createIdentifier('ExpressionUtils'),
                              ),
                          ]
                        : []),
                ]),
            ),
            ts.factory.createStringLiteral('@zenstackhq/schema'),
        );
        statements.push(schemaImportDecl);

        statements.push(schemaClass);

        // export const schema = new SchemaType();
        const schemaDecl = ts.factory.createVariableStatement(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            ts.factory.createVariableDeclarationList(
                [
                    ts.factory.createVariableDeclaration(
                        'schema',
                        undefined,
                        undefined,
                        ts.factory.createNewExpression(ts.factory.createIdentifier('SchemaType'), undefined, []),
                    ),
                ],
                ts.NodeFlags.Const,
            ),
        );
        statements.push(schemaDecl);
    }

    private createExpressionUtilsCall(method: string, args?: ts.Expression[]): ts.CallExpression {
        this.usedExpressionUtils = true;
        return ts.factory.createCallExpression(
            ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('ExpressionUtils'), method),
            undefined,
            args || [],
        );
    }

    private createSchemaClass(model: Model, lite: boolean) {
        const members: ts.ClassElement[] = [
            // provider
            ts.factory.createPropertyDeclaration(
                undefined,
                'provider',
                undefined,
                undefined,
                this.createAsConst(this.createProviderObject(model)),
            ),

            // models
            ts.factory.createPropertyDeclaration(
                undefined,
                'models',
                undefined,
                undefined,
                this.createAsConst(this.createModelsObject(model, lite)),
            ),

            // typeDefs
            ...(model.declarations.some(isTypeDef)
                ? [
                      ts.factory.createPropertyDeclaration(
                          undefined,
                          'typeDefs',
                          undefined,
                          undefined,
                          this.createAsConst(this.createTypeDefsObject(model, lite)),
                      ),
                  ]
                : []),
        ];

        // enums
        const enums = model.declarations.filter(isEnum);
        if (enums.length > 0) {
            members.push(
                ts.factory.createPropertyDeclaration(
                    undefined,
                    'enums',
                    undefined,
                    undefined,
                    this.createAsConst(
                        ts.factory.createObjectLiteralExpression(
                            enums.map((e) => ts.factory.createPropertyAssignment(e.name, this.createEnumObject(e))),
                            true,
                        ),
                    ),
                ),
            );
        }

        // authType
        const authType = getAuthDecl(model);
        if (authType) {
            members.push(
                ts.factory.createPropertyDeclaration(
                    undefined,
                    'authType',
                    undefined,
                    undefined,
                    this.createAsConst(this.createLiteralNode(authType.name)),
                ),
            );
        }

        // procedures
        const procedures = model.declarations.filter(isProcedure);
        if (procedures.length > 0) {
            members.push(
                ts.factory.createPropertyDeclaration(
                    undefined,
                    'procedures',
                    undefined,
                    undefined,
                    this.createAsConst(this.createProceduresObject(procedures)),
                ),
            );
        }

        // plugins
        members.push(
            ts.factory.createPropertyDeclaration(
                undefined,
                'plugins',
                undefined,
                undefined,
                ts.factory.createObjectLiteralExpression([], true),
            ),
        );

        const schemaClass = ts.factory.createClassDeclaration(
            [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
            'SchemaType',
            undefined,
            [
                ts.factory.createHeritageClause(ts.SyntaxKind.ImplementsKeyword, [
                    ts.factory.createExpressionWithTypeArguments(ts.factory.createIdentifier('SchemaDef'), undefined),
                ]),
            ],
            members,
        );

        return schemaClass;
    }

    private createAsConst(expr: ts.Expression) {
        return ts.factory.createAsExpression(expr, ts.factory.createTypeReferenceNode('const'));
    }

    private createProviderObject(model: Model): ts.Expression {
        const dsProvider = this.getDataSourceProvider(model);
        const defaultSchema = this.getDataSourceDefaultSchema(model);

        return ts.factory.createObjectLiteralExpression(
            [
                ts.factory.createPropertyAssignment('type', ts.factory.createStringLiteral(dsProvider)),
                ...(defaultSchema
                    ? [
                          ts.factory.createPropertyAssignment(
                              'defaultSchema',
                              ts.factory.createStringLiteral(defaultSchema),
                          ),
                      ]
                    : []),
            ],
            true,
        );
    }

    private createModelsObject(model: Model, lite: boolean): ts.Expression {
        return ts.factory.createObjectLiteralExpression(
            this.getAllDataModels(model).map((dm) =>
                ts.factory.createPropertyAssignment(dm.name, this.createDataModelObject(dm, lite)),
            ),
            true,
        );
    }

    private getAllDataModels(model: Model) {
        return model.declarations.filter((d): d is DataModel => isDataModel(d) && !hasAttribute(d, '@@ignore'));
    }

    private getAllTypeDefs(model: Model) {
        return model.declarations.filter((d): d is TypeDef => isTypeDef(d) && !hasAttribute(d, '@@ignore'));
    }

    private createTypeDefsObject(model: Model, lite: boolean): ts.Expression {
        return ts.factory.createObjectLiteralExpression(
            this.getAllTypeDefs(model).map((td) =>
                ts.factory.createPropertyAssignment(td.name, this.createTypeDefObject(td, lite)),
            ),
            true,
        );
    }

    private createDataModelObject(dm: DataModel, lite: boolean) {
        const allFields = getAllFields(dm);
        const allAttributes = lite
            ? [] // in lite mode, skip all model-level attributes
            : getAllAttributes(dm).filter((attr) => {
                  // exclude `@@delegate` attribute from base model
                  if (attr.decl.$refText === '@@delegate' && attr.$container !== dm) {
                      return false;
                  }
                  return true;
              });
        const subModels = this.getSubModels(dm);

        const fields: ts.PropertyAssignment[] = [
            // name
            ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(dm.name)),

            // baseModel
            ...(dm.baseModel
                ? [
                      ts.factory.createPropertyAssignment(
                          'baseModel',
                          ts.factory.createStringLiteral(dm.baseModel.$refText),
                      ),
                  ]
                : []),

            // fields
            ts.factory.createPropertyAssignment(
                'fields',
                ts.factory.createObjectLiteralExpression(
                    allFields.map((field) =>
                        ts.factory.createPropertyAssignment(field.name, this.createDataFieldObject(field, dm, lite)),
                    ),
                    true,
                ),
            ),

            // attributes
            ...(allAttributes.length > 0
                ? [
                      ts.factory.createPropertyAssignment(
                          'attributes',
                          ts.factory.createArrayLiteralExpression(
                              allAttributes.map((attr) => this.createAttributeObject(attr)),
                              true,
                          ),
                      ),
                  ]
                : []),

            // idFields
            ts.factory.createPropertyAssignment(
                'idFields',
                ts.factory.createArrayLiteralExpression(
                    getIdFields(dm).map((idField) => ts.factory.createStringLiteral(idField)),
                ),
            ),

            // uniqueFields
            ts.factory.createPropertyAssignment('uniqueFields', this.createUniqueFieldsObject(dm)),

            // isDelegate
            ...(isDelegateModel(dm)
                ? [ts.factory.createPropertyAssignment('isDelegate', ts.factory.createTrue())]
                : []),

            // subModels
            ...(subModels.length > 0
                ? [
                      ts.factory.createPropertyAssignment(
                          'subModels',
                          ts.factory.createArrayLiteralExpression(
                              subModels.map((subModel) => ts.factory.createStringLiteral(subModel)),
                          ),
                      ),
                  ]
                : []),

            ...(dm.isView ? [ts.factory.createPropertyAssignment('isView', ts.factory.createTrue())] : []),
        ];

        const computedFields = dm.fields.filter((f) => hasAttribute(f, '@computed'));

        if (computedFields.length > 0) {
            fields.push(
                ts.factory.createPropertyAssignment('computedFields', this.createComputedFieldsObject(computedFields)),
            );
        }

        return ts.factory.createObjectLiteralExpression(fields, true);
    }

    private getSubModels(dm: DataModel) {
        return dm.$container.declarations
            .filter(isDataModel)
            .filter((d) => d.baseModel?.ref === dm)
            .map((d) => d.name);
    }

    private createTypeDefObject(td: TypeDef, lite: boolean): ts.Expression {
        const allFields = getAllFields(td);
        const allAttributes = getAllAttributes(td);

        const fields: ts.PropertyAssignment[] = [
            // name
            ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(td.name)),

            // fields
            ts.factory.createPropertyAssignment(
                'fields',
                ts.factory.createObjectLiteralExpression(
                    allFields.map((field) =>
                        ts.factory.createPropertyAssignment(
                            field.name,
                            this.createDataFieldObject(field, undefined, lite),
                        ),
                    ),
                    true,
                ),
            ),

            // attributes
            ...(allAttributes.length > 0
                ? [
                      ts.factory.createPropertyAssignment(
                          'attributes',
                          ts.factory.createArrayLiteralExpression(
                              allAttributes.map((attr) => this.createAttributeObject(attr)),
                              true,
                          ),
                      ),
                  ]
                : []),
        ];

        return ts.factory.createObjectLiteralExpression(fields, true);
    }

    private createComputedFieldsObject(fields: DataField[]) {
        return ts.factory.createObjectLiteralExpression(
            fields.map((field) =>
                ts.factory.createMethodDeclaration(
                    undefined,
                    undefined,
                    field.name,
                    undefined,
                    undefined,
                    [
                        // parameter: `context: { modelAlias: string }`
                        ts.factory.createParameterDeclaration(
                            undefined,
                            undefined,
                            '_context',
                            undefined,
                            ts.factory.createTypeLiteralNode([
                                ts.factory.createPropertySignature(
                                    undefined,
                                    'modelAlias',
                                    undefined,
                                    ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword),
                                ),
                            ]),
                            undefined,
                        ),
                    ],
                    ts.factory.createTypeReferenceNode(this.mapFieldTypeToTSType(field.type)),
                    ts.factory.createBlock(
                        [
                            ts.factory.createThrowStatement(
                                ts.factory.createNewExpression(ts.factory.createIdentifier('Error'), undefined, [
                                    ts.factory.createStringLiteral('This is a stub for computed field'),
                                ]),
                            ),
                        ],
                        true,
                    ),
                ),
            ),
            true,
        );
    }

    private createUpdatedAtObject(ignoreArg: AttributeArg) {
        return ts.factory.createObjectLiteralExpression([
            ts.factory.createPropertyAssignment(
                'ignore',
                ts.factory.createArrayLiteralExpression(
                    (ignoreArg.value as ArrayExpr).items.map((item) =>
                        ts.factory.createStringLiteral((item as ReferenceExpr).target.$refText),
                    ),
                ),
            ),
        ]);
    }

    private mapFieldTypeToTSType(type: DataFieldType) {
        let result = match(type.type)
            .with('String', () => 'string')
            .with('Boolean', () => 'boolean')
            .with('Int', () => 'number')
            .with('Float', () => 'number')
            .with('BigInt', () => 'bigint')
            .with('Decimal', () => 'number')
            .otherwise(() => 'unknown');
        if (type.array) {
            result = `${result}[]`;
        }
        if (type.optional) {
            result = `${result} | null`;
        }
        return result;
    }

    private createDataFieldObject(field: DataField, contextModel: DataModel | undefined, lite: boolean) {
        const objectFields = [
            // name
            ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(field.name)),
            // type
            ts.factory.createPropertyAssignment('type', this.generateFieldTypeLiteral(field)),
        ];

        if (contextModel && ModelUtils.isIdField(field, contextModel)) {
            objectFields.push(ts.factory.createPropertyAssignment('id', ts.factory.createTrue()));
        }

        if (isUniqueField(field)) {
            objectFields.push(ts.factory.createPropertyAssignment('unique', ts.factory.createTrue()));
        }

        if (field.type.optional) {
            objectFields.push(ts.factory.createPropertyAssignment('optional', ts.factory.createTrue()));
        }

        if (field.type.array) {
            objectFields.push(ts.factory.createPropertyAssignment('array', ts.factory.createTrue()));
        }

        const updatedAtAttrib = getAttribute(field, '@updatedAt') as DataFieldAttribute | undefined;
        if (updatedAtAttrib) {
            const ignoreArg = updatedAtAttrib.args.find((arg) => arg.$resolvedParam?.name === 'ignore');
            objectFields.push(
                ts.factory.createPropertyAssignment(
                    'updatedAt',
                    ignoreArg ? this.createUpdatedAtObject(ignoreArg) : ts.factory.createTrue(),
                ),
            );
        }

        if (hasAttribute(field, '@omit')) {
            objectFields.push(ts.factory.createPropertyAssignment('omit', ts.factory.createTrue()));
        }

        // originModel
        if (
            contextModel &&
            // id fields are duplicated in inherited models
            !isIdField(field, contextModel) &&
            field.$container !== contextModel &&
            isDelegateModel(field.$container)
        ) {
            // field is inherited from delegate
            objectFields.push(
                ts.factory.createPropertyAssignment(
                    'originModel',
                    ts.factory.createStringLiteral(field.$container.name),
                ),
            );
        }

        // discriminator
        if (this.isDiscriminatorField(field)) {
            objectFields.push(ts.factory.createPropertyAssignment('isDiscriminator', ts.factory.createTrue()));
        }

        // attributes, only when not in lite mode
        if (!lite && field.attributes.length > 0) {
            objectFields.push(
                ts.factory.createPropertyAssignment(
                    'attributes',
                    ts.factory.createArrayLiteralExpression(
                        field.attributes.map((attr) => this.createAttributeObject(attr)),
                    ),
                ),
            );
        }

        const defaultValue = this.getFieldMappedDefault(field);
        if (defaultValue !== undefined) {
            if (defaultValue === null) {
                objectFields.push(
                    ts.factory.createPropertyAssignment('default', this.createExpressionUtilsCall('_null')),
                );
            } else if (typeof defaultValue === 'object' && !Array.isArray(defaultValue)) {
                if ('call' in defaultValue) {
                    objectFields.push(
                        ts.factory.createPropertyAssignment(
                            'default',
                            this.createExpressionUtilsCall('call', [
                                ts.factory.createStringLiteral(defaultValue.call),
                                ...(defaultValue.args.length > 0
                                    ? [
                                          ts.factory.createArrayLiteralExpression(
                                              defaultValue.args.map((arg) =>
                                                  this.createExpressionUtilsCall('literal', [
                                                      this.createLiteralNode(arg),
                                                  ]),
                                              ),
                                          ),
                                      ]
                                    : []),
                            ]),
                        ),
                    );
                } else if ('authMember' in defaultValue) {
                    objectFields.push(
                        ts.factory.createPropertyAssignment(
                            'default',
                            this.createExpressionUtilsCall('member', [
                                this.createExpressionUtilsCall('call', [ts.factory.createStringLiteral('auth')]),
                                ts.factory.createArrayLiteralExpression(
                                    defaultValue.authMember.map((m) => ts.factory.createStringLiteral(m)),
                                ),
                            ]),
                        ),
                    );
                } else {
                    throw new Error(`Unsupported default value type for field ${field.name}`);
                }
            } else {
                if (Array.isArray(defaultValue)) {
                    objectFields.push(
                        ts.factory.createPropertyAssignment(
                            'default',
                            ts.factory.createArrayLiteralExpression(
                                defaultValue.map((item) => this.createLiteralNode(item as any)),
                            ),
                        ),
                    );
                } else {
                    objectFields.push(
                        ts.factory.createPropertyAssignment('default', this.createLiteralNode(defaultValue)),
                    );
                }
            }
        }

        if (hasAttribute(field, '@computed')) {
            objectFields.push(ts.factory.createPropertyAssignment('computed', ts.factory.createTrue()));
        }

        if (isDataModel(field.type.reference?.ref)) {
            objectFields.push(ts.factory.createPropertyAssignment('relation', this.createRelationObject(field)));
        }

        const fkFor = this.getForeignKeyFor(field);
        if (fkFor && fkFor.length > 0) {
            objectFields.push(
                ts.factory.createPropertyAssignment(
                    'foreignKeyFor',
                    ts.factory.createArrayLiteralExpression(
                        fkFor.map((fk) => ts.factory.createStringLiteral(fk)),
                        true,
                    ),
                ),
            );
        }

        return ts.factory.createObjectLiteralExpression(objectFields, true);
    }

    private isDiscriminatorField(field: DataField) {
        const origin = field.$container;
        return getAttribute(origin, '@@delegate')?.args.some(
            (arg) =>
                arg.$resolvedParam.name === 'discriminator' &&
                isDataFieldReference(arg.value) &&
                arg.value.target.ref === field,
        );
    }

    private getDataSourceProvider(model: Model) {
        const dataSource = model.declarations.find(isDataSource);
        invariant(dataSource, 'No data source found in the model');

        const providerExpr = dataSource.fields.find((f) => f.name === 'provider')?.value;
        invariant(
            isLiteralExpr(providerExpr) && typeof providerExpr.value === 'string',
            'Provider must be a string literal',
        );
        return providerExpr.value as string;
    }

    private getDataSourceDefaultSchema(model: Model) {
        const dataSource = model.declarations.find(isDataSource);
        invariant(dataSource, 'No data source found in the model');

        const defaultSchemaExpr = dataSource.fields.find((f) => f.name === 'defaultSchema')?.value;
        if (!defaultSchemaExpr) {
            return undefined;
        }
        invariant(
            isLiteralExpr(defaultSchemaExpr) && typeof defaultSchemaExpr.value === 'string',
            'Default schema must be a string literal',
        );
        return defaultSchemaExpr.value as string;
    }

    private getFieldMappedDefault(
        field: DataField,
    ):
        | string
        | number
        | boolean
        | unknown[]
        | { call: string; args: any[] }
        | { authMember: string[] }
        | null
        | undefined {
        const defaultAttr = getAttribute(field, '@default');
        if (!defaultAttr) {
            return undefined;
        }
        const defaultValue = defaultAttr.args[0]?.value;
        invariant(defaultValue, 'Expected a default value');
        return this.getMappedValue(defaultValue, field.type);
    }

    private getMappedValue(
        expr: Expression,
        fieldType: DataFieldType,
    ): string | number | boolean | unknown[] | { call: string; args: any[] } | { authMember: string[] } | null {
        if (isLiteralExpr(expr)) {
            const lit = (expr as LiteralExpr).value;
            return fieldType.type === 'Boolean'
                ? (lit as boolean)
                : ['Int', 'Float', 'Decimal', 'BigInt'].includes(fieldType.type!)
                  ? Number(lit)
                  : lit;
        } else if (isArrayExpr(expr)) {
            return expr.items.map((item) => this.getMappedValue(item, fieldType));
        } else if (isReferenceExpr(expr) && isEnumField(expr.target.ref)) {
            return expr.target.ref.name;
        } else if (isInvocationExpr(expr)) {
            return {
                call: expr.function.$refText,
                args: expr.args.map((arg) => this.getLiteral(arg.value)),
            };
        } else if (this.isAuthMemberAccess(expr)) {
            return {
                authMember: this.getMemberAccessChain(expr),
            };
        } else if (isNullExpr(expr)) {
            return null;
        } else {
            throw new Error(`Unsupported expression type: ${expr.$type}`);
        }
    }

    private getMemberAccessChain(expr: MemberAccessExpr): string[] {
        if (!isMemberAccessExpr(expr.operand)) {
            return [expr.member.$refText];
        } else {
            return [...this.getMemberAccessChain(expr.operand), expr.member.$refText];
        }
    }

    private isAuthMemberAccess(expr: Expression): expr is MemberAccessExpr {
        if (isMemberAccessExpr(expr)) {
            return this.isAuthInvocation(expr.operand) || this.isAuthMemberAccess(expr.operand);
        } else {
            return false;
        }
    }

    private isAuthInvocation(expr: Expression) {
        return (
            isInvocationExpr(expr) && expr.function.$refText === 'auth' && ModelUtils.isFromStdlib(expr.function.ref!)
        );
    }

    private createRelationObject(field: DataField) {
        const relationFields: ts.PropertyAssignment[] = [];

        const oppositeRelation = this.getOppositeRelationField(field);
        if (oppositeRelation) {
            relationFields.push(
                ts.factory.createPropertyAssignment('opposite', ts.factory.createStringLiteral(oppositeRelation.name)),
            );
        }

        const relationName = this.getRelationName(field);
        if (relationName) {
            relationFields.push(
                ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(relationName)),
            );
        }

        const relation = getAttribute(field, '@relation');
        const fkFields: string[] = [];
        if (relation) {
            for (const arg of relation.args) {
                const param = arg.$resolvedParam.name;
                if (param === 'fields' || param === 'references') {
                    const fieldNames = this.getReferenceNames(arg.value);
                    if (fieldNames) {
                        if (param === 'fields') {
                            fkFields.push(...fieldNames);
                        }
                        relationFields.push(
                            ts.factory.createPropertyAssignment(
                                param,
                                ts.factory.createArrayLiteralExpression(
                                    fieldNames.map((el) => ts.factory.createStringLiteral(el)),
                                ),
                            ),
                        );
                    }
                }

                if (param === 'onDelete' || param === 'onUpdate') {
                    const action = (arg.value as ReferenceExpr).target.$refText;
                    relationFields.push(
                        ts.factory.createPropertyAssignment(param, ts.factory.createStringLiteral(action)),
                    );
                }
            }
        }

        // check if all fk fields have default values
        if (fkFields.length > 0) {
            const allHaveDefault = fkFields.every((fieldName) => {
                const fieldDef = field.$container.fields.find((f) => f.name === fieldName);
                return fieldDef && hasAttribute(fieldDef, '@default');
            });
            if (allHaveDefault) {
                relationFields.push(ts.factory.createPropertyAssignment('hasDefault', ts.factory.createTrue()));
            }
        }

        return ts.factory.createObjectLiteralExpression(relationFields);
    }

    private getReferenceNames(expr: Expression) {
        return isArrayExpr(expr) && expr.items.map((item) => (item as ReferenceExpr).target.$refText);
    }

    private getForeignKeyFor(field: DataField) {
        const result: string[] = [];
        for (const f of field.$container.fields) {
            const relation = getAttribute(f, '@relation');
            if (relation) {
                for (const arg of relation.args) {
                    if (
                        arg.name === 'fields' &&
                        isArrayExpr(arg.value) &&
                        arg.value.items.some((el) => isReferenceExpr(el) && el.target.ref === field)
                    ) {
                        result.push(f.name);
                    }
                }
            }
        }
        return result;
    }

    private getOppositeRelationField(field: DataField) {
        if (!field.type.reference?.ref || !isDataModel(field.type.reference?.ref)) {
            return undefined;
        }

        const sourceModel = field.$container as DataModel;
        const targetModel = field.type.reference.ref as DataModel;
        const relationName = this.getRelationName(field);
        for (const otherField of targetModel.fields) {
            if (otherField === field) {
                // backlink field is never self
                continue;
            }
            if (otherField.type.reference?.ref === sourceModel) {
                if (relationName) {
                    // if relation has a name, the opposite side must match
                    const otherRelationName = this.getRelationName(otherField);
                    if (otherRelationName === relationName) {
                        return otherField;
                    }
                } else {
                    return otherField;
                }
            }
        }
        return undefined;
    }

    private getRelationName(field: DataField) {
        const relation = getAttribute(field, '@relation');
        if (relation) {
            const nameArg = relation.args.find((arg) => arg.$resolvedParam.name === 'name');
            if (nameArg) {
                invariant(isLiteralExpr(nameArg.value), 'name must be a literal');
                return nameArg.value.value as string;
            }
        }
        return undefined;
    }

    private createUniqueFieldsObject(dm: DataModel) {
        const properties: ts.PropertyAssignment[] = [];

        // field-level id and unique
        const allFields = getAllFields(dm);
        for (const field of allFields) {
            if (hasAttribute(field, '@id') || hasAttribute(field, '@unique')) {
                properties.push(
                    ts.factory.createPropertyAssignment(
                        field.name,
                        ts.factory.createObjectLiteralExpression([
                            ts.factory.createPropertyAssignment('type', this.generateFieldTypeLiteral(field)),
                        ]),
                    ),
                );
            }
        }

        // model-level id and unique
        const allAttributes = getAllAttributes(dm);

        // it's possible to have the same set of fields in both `@@id` and `@@unique`
        // so we need to deduplicate them
        const seenKeys = new Set<string>();
        for (const attr of allAttributes) {
            if (attr.decl.$refText === '@@id' || attr.decl.$refText === '@@unique') {
                const fieldsArg = getAttributeArg(attr, 'fields');
                if (!fieldsArg) {
                    continue;
                }
                const fieldNames = this.getReferenceNames(fieldsArg);
                if (!fieldNames) {
                    continue;
                }

                if (fieldNames.length === 1) {
                    // single-field unique
                    const fieldDef = allFields.find((f) => f.name === fieldNames[0])!;
                    properties.push(
                        ts.factory.createPropertyAssignment(
                            fieldNames[0]!,
                            ts.factory.createObjectLiteralExpression([
                                ts.factory.createPropertyAssignment('type', this.generateFieldTypeLiteral(fieldDef)),
                            ]),
                        ),
                    );
                } else {
                    // multi-field unique
                    const key = this.getCompoundUniqueKey(attr, fieldNames);
                    if (seenKeys.has(key)) {
                        continue;
                    }
                    seenKeys.add(key);
                    properties.push(
                        ts.factory.createPropertyAssignment(
                            key,
                            ts.factory.createObjectLiteralExpression(
                                fieldNames.map((field) => {
                                    const fieldDef = allFields.find((f) => f.name === field)!;
                                    return ts.factory.createPropertyAssignment(
                                        field,
                                        ts.factory.createObjectLiteralExpression([
                                            ts.factory.createPropertyAssignment(
                                                'type',
                                                this.generateFieldTypeLiteral(fieldDef),
                                            ),
                                        ]),
                                    );
                                }),
                            ),
                        ),
                    );
                }
            }
        }

        return ts.factory.createObjectLiteralExpression(properties, true);
    }

    private getCompoundUniqueKey(attr: DataModelAttribute, fieldNames: string[]) {
        const nameArg = attr.args.find((arg) => arg.$resolvedParam.name === 'name');
        if (nameArg && isLiteralExpr(nameArg.value)) {
            return nameArg.value.value as string;
        } else {
            return fieldNames.join('_');
        }
    }

    private generateFieldTypeLiteral(field: DataField): ts.Expression {
        invariant(
            field.type.type || field.type.reference || field.type.unsupported,
            'Field type must be a primitive, reference, or Unsupported',
        );

        return field.type.type
            ? ts.factory.createStringLiteral(field.type.type)
            : field.type.reference
              ? ts.factory.createStringLiteral(field.type.reference.$refText)
              : // `Unsupported` type
                ts.factory.createStringLiteral('Unsupported');
    }

    private createEnumObject(e: Enum) {
        return ts.factory.createObjectLiteralExpression(
            [
                ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(e.name)),

                ts.factory.createPropertyAssignment(
                    'values',
                    ts.factory.createObjectLiteralExpression(
                        e.fields.map((f) =>
                            ts.factory.createPropertyAssignment(f.name, ts.factory.createStringLiteral(f.name)),
                        ),
                        true,
                    ),
                ),

                // only generate `fields` if there are attributes on the fields
                ...(e.fields.some((f) => f.attributes.length > 0)
                    ? [
                          ts.factory.createPropertyAssignment(
                              'fields',
                              ts.factory.createObjectLiteralExpression(
                                  e.fields.map((field) =>
                                      ts.factory.createPropertyAssignment(
                                          field.name,
                                          ts.factory.createObjectLiteralExpression(
                                              [
                                                  ts.factory.createPropertyAssignment(
                                                      'name',
                                                      ts.factory.createStringLiteral(field.name),
                                                  ),
                                                  ...(field.attributes.length > 0
                                                      ? [
                                                            ts.factory.createPropertyAssignment(
                                                                'attributes',
                                                                ts.factory.createArrayLiteralExpression(
                                                                    field.attributes?.map((attr) =>
                                                                        this.createAttributeObject(attr),
                                                                    ) ?? [],
                                                                    true,
                                                                ),
                                                            ),
                                                        ]
                                                      : []),
                                              ],
                                              true,
                                          ),
                                      ),
                                  ),
                                  true,
                              ),
                          ),
                      ]
                    : []),

                ...(e.attributes.length > 0
                    ? [
                          ts.factory.createPropertyAssignment(
                              'attributes',
                              ts.factory.createArrayLiteralExpression(
                                  e.attributes.map((attr) => this.createAttributeObject(attr)),
                                  true,
                              ),
                          ),
                      ]
                    : []),
            ],
            true,
        );
    }

    private getLiteral(expr: Expression) {
        if (!isLiteralExpr(expr)) {
            throw new Error('Expected a literal expression');
        }
        switch (expr?.$type) {
            case 'StringLiteral':
            case 'BooleanLiteral':
                return expr.value;
            case 'NumberLiteral':
                return parseFloat(expr.value);
            default:
                throw new Error('Unsupported literal type');
        }
    }

    private createLiteralNode(arg: string | number | boolean | null): any {
        return arg === null
            ? ts.factory.createNull()
            : typeof arg === 'string'
              ? ts.factory.createStringLiteral(arg)
              : typeof arg === 'number'
                ? this.createNumberLiteral(arg)
                : arg === true
                  ? ts.factory.createTrue()
                  : arg === false
                    ? ts.factory.createFalse()
                    : undefined;
    }

    private createNumberLiteral(arg: number) {
        return arg < 0
            ? ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.MinusToken, ts.factory.createNumericLiteral(-arg))
            : ts.factory.createNumericLiteral(arg);
    }

    private createProceduresObject(procedures: Procedure[]) {
        return ts.factory.createObjectLiteralExpression(
            procedures.map((proc) => ts.factory.createPropertyAssignment(proc.name, this.createProcedureObject(proc))),
            true,
        );
    }

    private createProcedureObject(proc: Procedure) {
        const params = ts.factory.createObjectLiteralExpression(
            proc.params.map((param) =>
                ts.factory.createPropertyAssignment(
                    param.name,
                    ts.factory.createObjectLiteralExpression([
                        ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(param.name)),
                        ...(param.optional
                            ? [ts.factory.createPropertyAssignment('optional', ts.factory.createTrue())]
                            : []),
                        ...(param.type.array
                            ? [ts.factory.createPropertyAssignment('array', ts.factory.createTrue())]
                            : []),
                        ts.factory.createPropertyAssignment(
                            'type',
                            ts.factory.createStringLiteral(param.type.type ?? param.type.reference!.$refText),
                        ),
                    ]),
                ),
            ),
            true,
        );

        return ts.factory.createObjectLiteralExpression(
            [
                ts.factory.createPropertyAssignment('params', params),
                ts.factory.createPropertyAssignment(
                    'returnType',
                    ts.factory.createStringLiteral(proc.returnType.type ?? proc.returnType.reference!.$refText),
                ),
                ...(proc.returnType.array
                    ? [ts.factory.createPropertyAssignment('returnArray', ts.factory.createTrue())]
                    : []),
                ...(proc.mutation ? [ts.factory.createPropertyAssignment('mutation', ts.factory.createTrue())] : []),
            ],
            true,
        );
    }

    private generateBannerComments(statements: ts.Statement[]) {
        const banner = `////////////////////////////////////////////////////////////////////////////////////////////
// DO NOT MODIFY THIS FILE                                                                  //
// This file is automatically generated by ZenStack CLI and should not be manually updated. //
//////////////////////////////////////////////////////////////////////////////////////////////

/* eslint-disable */

`;
        ts.addSyntheticLeadingComment(statements[0]!, ts.SyntaxKind.SingleLineCommentTrivia, banner);
    }

    private createAttributeObject(attr: DataModelAttribute | DataFieldAttribute): ts.Expression {
        return ts.factory.createObjectLiteralExpression([
            ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(attr.decl.$refText)),
            ...(attr.args.length > 0
                ? [
                      ts.factory.createPropertyAssignment(
                          'args',
                          ts.factory.createArrayLiteralExpression(attr.args.map((arg) => this.createAttributeArg(arg))),
                      ),
                  ]
                : []),
        ]);
    }

    private createAttributeArg(arg: AttributeArg): ts.Expression {
        return ts.factory.createObjectLiteralExpression([
            // name
            ...(arg.$resolvedParam?.name
                ? [ts.factory.createPropertyAssignment('name', ts.factory.createStringLiteral(arg.$resolvedParam.name))]
                : []),

            // value
            ts.factory.createPropertyAssignment('value', this.createExpression(arg.value)),
        ]);
    }

    private createExpression(value: Expression): ts.Expression {
        return match(value)
            .when(isLiteralExpr, (expr) => this.createLiteralExpression(expr.$type, expr.value))
            .when(isInvocationExpr, (expr) => this.createCallExpression(expr))
            .when(isReferenceExpr, (expr) => this.createRefExpression(expr))
            .when(isArrayExpr, (expr) => this.createArrayExpression(expr))
            .when(isUnaryExpr, (expr) => this.createUnaryExpression(expr))
            .when(isBinaryExpr, (expr) => this.createBinaryExpression(expr))
            .when(isMemberAccessExpr, (expr) => this.createMemberExpression(expr))
            .when(isNullExpr, () => this.createNullExpression())
            .when(isThisExpr, () => this.createThisExpression())
            .otherwise(() => {
                throw new Error(`Unsupported attribute arg value: ${value.$type}`);
            });
    }

    private createThisExpression() {
        return this.createExpressionUtilsCall('_this');
    }

    private createMemberExpression(expr: MemberAccessExpr) {
        const members: string[] = [];

        // turn nested member access expression into a flat list of members
        let current: Expression = expr;
        while (isMemberAccessExpr(current)) {
            members.unshift(current.member.$refText);
            current = current.operand;
        }
        const receiver = current;

        const args = [
            this.createExpression(receiver),
            ts.factory.createArrayLiteralExpression(members.map((m) => ts.factory.createStringLiteral(m))),
        ];

        return this.createExpressionUtilsCall('member', args);
    }

    private createNullExpression() {
        return this.createExpressionUtilsCall('_null');
    }

    private createBinaryExpression(expr: BinaryExpr) {
        const args = [
            this.createExpression(expr.left),
            this.createLiteralNode(expr.operator),
            this.createExpression(expr.right),
        ];

        if (expr.binding) {
            args.push(this.createLiteralNode(expr.binding.name));
        }

        return this.createExpressionUtilsCall('binary', args);
    }

    private createUnaryExpression(expr: UnaryExpr) {
        return this.createExpressionUtilsCall('unary', [
            this.createLiteralNode(expr.operator),
            this.createExpression(expr.operand),
        ]);
    }

    private createArrayExpression(expr: ArrayExpr): any {
        const arrayResolved = expr.$resolvedType?.decl;
        const arrayType = typeof arrayResolved === 'string' ? arrayResolved : arrayResolved?.name;
        invariant(arrayType, 'Array type must be resolved to a string or declaration');
        return this.createExpressionUtilsCall('array', [
            this.createLiteralNode(arrayType),
            ts.factory.createArrayLiteralExpression(expr.items.map((item) => this.createExpression(item))),
        ]);
    }

    private createRefExpression(expr: ReferenceExpr): any {
        const target = expr.target.ref;
        return match(target)
            .when(isDataField, () =>
                this.createExpressionUtilsCall('field', [this.createLiteralNode(expr.target.$refText)]),
            )
            .when(isEnumField, () => this.createLiteralExpression('StringLiteral', expr.target.$refText))
            .when(isCollectionPredicateBinding, () =>
                this.createExpressionUtilsCall('binding', [this.createLiteralNode(expr.target.$refText)]),
            )
            .otherwise(() => {
                throw Error(`Unsupported reference type: ${expr.target.$refText}`);
            });
    }

    private createCallExpression(expr: InvocationExpr) {
        return this.createExpressionUtilsCall('call', [
            ts.factory.createStringLiteral(expr.function.$refText),
            ...(expr.args.length > 0
                ? [ts.factory.createArrayLiteralExpression(expr.args.map((arg) => this.createExpression(arg.value)))]
                : []),
        ]);
    }

    private createLiteralExpression(type: string, value: string | boolean) {
        return match(type)
            .with('BooleanLiteral', () => this.createExpressionUtilsCall('literal', [this.createLiteralNode(value)]))
            .with('NumberLiteral', () =>
                this.createExpressionUtilsCall('literal', [ts.factory.createIdentifier(value as string)]),
            )
            .with('StringLiteral', () => this.createExpressionUtilsCall('literal', [this.createLiteralNode(value)]))
            .otherwise(() => {
                throw new Error(`Unsupported literal type: ${type}`);
            });
    }

    private generateModelsAndTypeDefs(model: Model, options: TsSchemaGeneratorOptions) {
        const statements: ts.Statement[] = [];

        // generate: import { schema as $schema, type SchemaType as $Schema } from './schema';
        statements.push(
            this.generateSchemaImport(
                model,
                true,
                true,
                !!(options.lite || options.liteOnly),
                options.importWithFileExtension,
            ),
        );

        // generate: import type { ModelResult as $ModelResult } from '@zenstackhq/orm';
        statements.push(
            ts.factory.createImportDeclaration(
                undefined,
                ts.factory.createImportClause(
                    true,
                    undefined,
                    ts.factory.createNamedImports([
                        ts.factory.createImportSpecifier(
                            false,
                            undefined,
                            ts.factory.createIdentifier(`ModelResult as $ModelResult`),
                        ),
                        ...(model.declarations.some(isTypeDef)
                            ? [
                                  ts.factory.createImportSpecifier(
                                      false,
                                      undefined,
                                      ts.factory.createIdentifier(`TypeDefResult as $TypeDefResult`),
                                  ),
                              ]
                            : []),
                    ]),
                ),
                ts.factory.createStringLiteral('@zenstackhq/orm'),
            ),
        );

        // generate: export type Model = $ModelResult<Schema, 'Model'>;
        const dataModels = this.getAllDataModels(model);
        for (const dm of dataModels) {
            let modelType = ts.factory.createTypeAliasDeclaration(
                [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                dm.name,
                undefined,
                ts.factory.createTypeReferenceNode('$ModelResult', [
                    ts.factory.createTypeReferenceNode('$Schema'),
                    ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(dm.name)),
                ]),
            );
            if (dm.comments.length > 0) {
                modelType = this.generateDocs(modelType, dm);
            }
            statements.push(modelType);
        }

        // generate: export type TypeDef = $TypeDefResult<Schema, 'TypeDef'>;
        const typeDefs = this.getAllTypeDefs(model);
        for (const td of typeDefs) {
            let typeDef = ts.factory.createTypeAliasDeclaration(
                [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                td.name,
                undefined,
                ts.factory.createTypeReferenceNode('$TypeDefResult', [
                    ts.factory.createTypeReferenceNode('$Schema'),
                    ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(td.name)),
                ]),
            );
            if (td.comments.length > 0) {
                typeDef = this.generateDocs(typeDef, td);
            }
            statements.push(typeDef);
        }

        // generate: export const Enum = $schema.enums.Enum['values'];
        const enums = model.declarations.filter(isEnum);
        for (const e of enums) {
            let enumDecl = ts.factory.createVariableStatement(
                [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                ts.factory.createVariableDeclarationList(
                    [
                        ts.factory.createVariableDeclaration(
                            e.name,
                            undefined,
                            undefined,
                            ts.factory.createPropertyAccessExpression(
                                ts.factory.createPropertyAccessExpression(
                                    ts.factory.createPropertyAccessExpression(
                                        ts.factory.createIdentifier('$schema'),
                                        ts.factory.createIdentifier('enums'),
                                    ),
                                    ts.factory.createIdentifier(e.name),
                                ),
                                ts.factory.createIdentifier('values'),
                            ),
                        ),
                    ],
                    ts.NodeFlags.Const,
                ),
            );
            if (e.comments.length > 0) {
                enumDecl = this.generateDocs(enumDecl, e);
            }
            statements.push(enumDecl);

            // generate: export type Enum = (typeof Enum)[keyof typeof Enum];
            let typeAlias = ts.factory.createTypeAliasDeclaration(
                [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                e.name,
                undefined,
                ts.factory.createIndexedAccessTypeNode(
                    ts.factory.createTypeQueryNode(ts.factory.createIdentifier(e.name)),
                    ts.factory.createTypeOperatorNode(
                        ts.SyntaxKind.KeyOfKeyword,
                        ts.factory.createTypeQueryNode(ts.factory.createIdentifier(e.name)),
                    ),
                ),
            );
            if (e.comments.length > 0) {
                typeAlias = this.generateDocs(typeAlias, e);
            }
            statements.push(typeAlias);
        }

        this.generateBannerComments(statements);

        // write to file
        const outputFile = path.join(options.outDir, 'models.ts');
        const sourceFile = ts.createSourceFile(outputFile, '', ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
        const printer = ts.createPrinter();
        const result = printer.printList(ts.ListFormat.MultiLine, ts.factory.createNodeArray(statements), sourceFile);
        fs.writeFileSync(outputFile, result);
    }

    private generateSchemaImport(
        model: Model,
        schemaObject: boolean,
        schemaType: boolean,
        useLite: boolean,
        importWithFileExtension: string | undefined,
    ) {
        const importSpecifiers = [];

        if (schemaObject) {
            if (model.declarations.some(isEnum)) {
                // enums require referencing the schema object
                importSpecifiers.push(
                    ts.factory.createImportSpecifier(
                        false,
                        ts.factory.createIdentifier('schema'),
                        ts.factory.createIdentifier('$schema'),
                    ),
                );
            }
        }

        if (schemaType) {
            importSpecifiers.push(
                ts.factory.createImportSpecifier(
                    true,
                    ts.factory.createIdentifier('SchemaType'),
                    ts.factory.createIdentifier('$Schema'),
                ),
            );
        }

        let importFrom = useLite ? './schema-lite' : './schema';
        if (importWithFileExtension) {
            importFrom += importWithFileExtension.startsWith('.')
                ? importWithFileExtension
                : `.${importWithFileExtension}`;
        }

        // import { schema as $schema, type SchemaType as $Schema } from './schema';
        return ts.factory.createImportDeclaration(
            undefined,
            ts.factory.createImportClause(false, undefined, ts.factory.createNamedImports(importSpecifiers)),
            ts.factory.createStringLiteral(importFrom),
        );
    }

    private generateDocs<T extends ts.TypeAliasDeclaration | ts.VariableStatement>(
        tsDecl: T,
        decl: DataModel | TypeDef | Enum,
    ): T {
        return ts.addSyntheticLeadingComment(
            tsDecl,
            ts.SyntaxKind.MultiLineCommentTrivia,
            `*\n * ${decl.comments.map((c) => c.replace(/^\s*\/*\s*/, '')).join('\n * ')}\n `,
            true,
        );
    }

    private generateInputTypes(model: Model, options: TsSchemaGeneratorOptions) {
        const dataModels = this.getAllDataModels(model);
        const statements: ts.Statement[] = [];

        // generate: import { SchemaType as $Schema } from './schema';
        statements.push(
            this.generateSchemaImport(
                model,
                false,
                true,
                !!(options.lite || options.liteOnly),
                options.importWithFileExtension,
            ),
        );

        // generate: import { CreateArgs as $CreateArgs, ... } from '@zenstackhq/orm';
        const inputTypes = [
            'FindManyArgs',
            'FindUniqueArgs',
            'FindFirstArgs',
            'ExistsArgs',
            'CreateArgs',
            'CreateManyArgs',
            'CreateManyAndReturnArgs',
            'UpdateArgs',
            'UpdateManyArgs',
            'UpdateManyAndReturnArgs',
            'UpsertArgs',
            'DeleteArgs',
            'DeleteManyArgs',
            'CountArgs',
            'AggregateArgs',
            'GroupByArgs',
            'WhereInput',
            'SelectInput',
            'IncludeInput',
            'OmitInput',
        ];

        const inputTypeNameFixes = {
            SelectInput: 'Select',
            IncludeInput: 'Include',
            OmitInput: 'Omit',
        };

        // generate: import { CreateArgs as $CreateArgs, ... } from '@zenstackhq/orm';
        statements.push(
            ts.factory.createImportDeclaration(
                undefined,
                ts.factory.createImportClause(
                    true,
                    undefined,
                    ts.factory.createNamedImports([
                        ...inputTypes.map((inputType) =>
                            ts.factory.createImportSpecifier(
                                false,
                                undefined,
                                ts.factory.createIdentifier(`${inputType} as $${inputType}`),
                            ),
                        ),
                        ts.factory.createImportSpecifier(
                            false,
                            undefined,
                            ts.factory.createIdentifier('QueryOptions as $QueryOptions'),
                        ),
                    ]),
                ),
                ts.factory.createStringLiteral('@zenstackhq/orm'),
            ),
        );

        // generate: import { type SelectIncludeOmit as $SelectIncludeOmit, type SimplifiedPlainResult as $Result } from '@zenstackhq/orm';
        statements.push(
            ts.factory.createImportDeclaration(
                undefined,
                ts.factory.createImportClause(
                    true,
                    undefined,
                    ts.factory.createNamedImports([
                        ts.factory.createImportSpecifier(
                            false,
                            undefined,
                            ts.factory.createIdentifier('SimplifiedPlainResult as $Result'),
                        ),
                        ts.factory.createImportSpecifier(
                            false,
                            undefined,
                            ts.factory.createIdentifier('SelectIncludeOmit as $SelectIncludeOmit'),
                        ),
                    ]),
                ),
                ts.factory.createStringLiteral('@zenstackhq/orm'),
            ),
        );

        for (const dm of dataModels) {
            // generate: export type ModelCreateArgs = $CreateArgs<Schema, Model>;
            for (const inputType of inputTypes) {
                const exportName = inputTypeNameFixes[inputType as keyof typeof inputTypeNameFixes]
                    ? `${dm.name}${inputTypeNameFixes[inputType as keyof typeof inputTypeNameFixes]}`
                    : `${dm.name}${inputType}`;
                statements.push(
                    ts.factory.createTypeAliasDeclaration(
                        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                        exportName,
                        undefined,
                        ts.factory.createTypeReferenceNode(`$${inputType}`, [
                            ts.factory.createTypeReferenceNode('$Schema'),
                            ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(dm.name)),
                        ]),
                    ),
                );
            }

            // generate: export type ModelGetPayload<Args extends $SelectIncludeOmit<Schema, Model, true>, Options extends $QueryOptions<Schema>> = $Result<Schema, Model, Args, Options>;
            statements.push(
                ts.factory.createTypeAliasDeclaration(
                    [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
                    `${dm.name}GetPayload`,
                    [
                        ts.factory.createTypeParameterDeclaration(
                            undefined,
                            'Args',
                            ts.factory.createTypeReferenceNode('$SelectIncludeOmit', [
                                ts.factory.createTypeReferenceNode('$Schema'),
                                ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(dm.name)),
                                ts.factory.createLiteralTypeNode(ts.factory.createTrue()),
                            ]),
                        ),
                        ts.factory.createTypeParameterDeclaration(
                            undefined,
                            'Options',
                            ts.factory.createTypeReferenceNode('$QueryOptions', [
                                ts.factory.createTypeReferenceNode('$Schema'),
                            ]),
                            ts.factory.createTypeReferenceNode('$QueryOptions', [
                                ts.factory.createTypeReferenceNode('$Schema'),
                            ]),
                        ),
                    ],
                    ts.factory.createTypeReferenceNode('$Result', [
                        ts.factory.createTypeReferenceNode('$Schema'),
                        ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(dm.name)),
                        ts.factory.createTypeReferenceNode('Args'),
                        ts.factory.createTypeReferenceNode('Options'),
                    ]),
                ),
            );
        }

        this.generateBannerComments(statements);

        // write to file
        const outputFile = path.join(options.outDir, 'input.ts');
        const sourceFile = ts.createSourceFile(outputFile, '', ts.ScriptTarget.ESNext, false, ts.ScriptKind.TS);
        const printer = ts.createPrinter();
        const result = printer.printList(ts.ListFormat.MultiLine, ts.factory.createNodeArray(statements), sourceFile);
        fs.writeFileSync(outputFile, result);
    }
}
