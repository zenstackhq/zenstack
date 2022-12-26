import { AstNode, LangiumDocument, ValidationAcceptor, ValidationChecks, ValidationRegistry } from 'langium';
import { Attribute, DataModel, DataSource, Enum, Expression, Model, ZModelAstType } from '@zenstackhq/language/ast';
import type { ZModelServices } from '../zmodel-module';
import SchemaValidator from './schema-validator';
import DataSourceValidator from './datasource-validator';
import DataModelValidator from './datamodel-validator';
import AttributeValidator from './attribute-validator';
import EnumValidator from './enum-validator';
import ExpressionValidator from './expression-validator';

/**
 * Registry for validation checks.
 */
export class ZModelValidationRegistry extends ValidationRegistry {
    constructor(services: ZModelServices) {
        super(services);
        const validator = services.validation.ZModelValidator;
        const checks: ValidationChecks<ZModelAstType> = {
            Model: validator.checkModel,
            DataSource: validator.checkDataSource,
            DataModel: validator.checkDataModel,
            Enum: validator.checkEnum,
            Attribute: validator.checkAttribute,
            Expression: validator.checkExpression,
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class ZModelValidator {
    private shouldCheck(node: AstNode) {
        let doc: LangiumDocument | undefined;
        let currNode: AstNode | undefined = node;
        while (currNode) {
            if (currNode.$document) {
                doc = currNode.$document;
                break;
            }
            currNode = currNode.$container;
        }

        return doc?.parseResult.lexerErrors.length === 0 && doc?.parseResult.parserErrors.length === 0;
    }

    checkModel(node: Model, accept: ValidationAcceptor): void {
        this.shouldCheck(node) && new SchemaValidator().validate(node, accept);
    }

    checkDataSource(node: DataSource, accept: ValidationAcceptor): void {
        this.shouldCheck(node) && new DataSourceValidator().validate(node, accept);
    }

    checkDataModel(node: DataModel, accept: ValidationAcceptor): void {
        this.shouldCheck(node) && new DataModelValidator().validate(node, accept);
    }

    checkEnum(node: Enum, accept: ValidationAcceptor): void {
        this.shouldCheck(node) && new EnumValidator().validate(node, accept);
    }

    checkAttribute(node: Attribute, accept: ValidationAcceptor): void {
        this.shouldCheck(node) && new AttributeValidator().validate(node, accept);
    }

    checkExpression(node: Expression, accept: ValidationAcceptor): void {
        new ExpressionValidator().validate(node, accept);
    }
}
