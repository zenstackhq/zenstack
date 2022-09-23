"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZModelValidator = exports.ZModelValidationRegistry = void 0;
const langium_1 = require("langium");
/**
 * Registry for validation checks.
 */
class ZModelValidationRegistry extends langium_1.ValidationRegistry {
    constructor(services) {
        super(services);
        const validator = services.validation.ZModelValidator;
        const checks = {
        // Person: validator.checkPersonStartsWithCapital
        };
        this.register(checks, validator);
    }
}
exports.ZModelValidationRegistry = ZModelValidationRegistry;
/**
 * Implementation of custom validations.
 */
class ZModelValidator {
}
exports.ZModelValidator = ZModelValidator;
//# sourceMappingURL=zmodel-validator.js.map