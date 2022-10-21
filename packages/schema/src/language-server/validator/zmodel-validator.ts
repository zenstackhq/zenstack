import {
    ValidationAcceptor,
    ValidationChecks,
    ValidationRegistry,
} from 'langium';
import { DataSource, Model, ZModelAstType } from '../generated/ast';
import type { ZModelServices } from '../zmodel-module';
import DataSourceValidator from './datasource-validator';
import ModelValidator from './model-validator';

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
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class ZModelValidator {
    checkModel(model: Model, accept: ValidationAcceptor) {
        new ModelValidator().validate(model, accept);
    }

    checkDataSource(ds: DataSource, accept: ValidationAcceptor) {
        new DataSourceValidator().validate(ds, accept);
    }
}
