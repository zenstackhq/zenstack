/**
 * @zenstackhq/runtime package name
 */
export const RUNTIME_PACKAGE = '@zenstackhq/runtime';

export { CrudFailureReason } from '@zenstackhq/runtime';

/**
 * Expression context
 */
export enum ExpressionContext {
    DefaultValue = 'DefaultValue',
    AccessPolicy = 'AccessPolicy',
    ValidationRule = 'ValidationRule',
    Index = 'Index',
}

export const STD_LIB_MODULE_NAME = 'stdlib.zmodel';
