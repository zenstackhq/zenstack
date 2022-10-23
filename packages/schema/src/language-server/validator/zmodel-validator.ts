import {
    ValidationAcceptor,
    ValidationChecks,
    ValidationRegistry,
} from 'langium';
import {
    Attribute,
    DataModel,
    DataSource,
    Enum,
    Model,
    ZModelAstType,
} from '../generated/ast';
import type { ZModelServices } from '../zmodel-module';
import SchemaValidator from './schema-validator';
import DataSourceValidator from './datasource-validator';
import DataModelValidator from './datamodel-validator';
import AttributeValidator from './attribute-validator';
import EnumValidator from './enum-validator';

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
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class ZModelValidator {
    checkModel(node: Model, accept: ValidationAcceptor) {
        new SchemaValidator().validate(node, accept);
    }

    checkDataSource(node: DataSource, accept: ValidationAcceptor) {
        new DataSourceValidator().validate(node, accept);
    }

    checkDataModel(node: DataModel, accept: ValidationAcceptor) {
        new DataModelValidator().validate(node, accept);
    }

    checkEnum(node: Enum, accept: ValidationAcceptor) {
        new EnumValidator().validate(node, accept);
    }

    checkAttribute(node: Attribute, accept: ValidationAcceptor) {
        new AttributeValidator().validate(node, accept);
    }
}
