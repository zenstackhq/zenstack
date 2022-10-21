import {
    ValidationAcceptor,
    ValidationChecks,
    ValidationRegistry,
} from 'langium';
import { DataModel, DataSource, Model, ZModelAstType } from '../generated/ast';
import type { ZModelServices } from '../zmodel-module';
import SchemaValidator from './schema-validator';
import DataSourceValidator from './datasource-validator';
import DataModelValidator from './datamodel-validator';

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
}
