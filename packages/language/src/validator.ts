import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type {
    Attribute,
    DataModel,
    DataSource,
    Enum,
    Expression,
    FunctionDecl,
    GeneratorDecl,
    InvocationExpr,
    Model,
    Procedure,
    TypeDef,
    ZModelAstType,
} from './generated/ast';
import type { ZModelServices } from './module';
import AttributeValidator from './validators/attribute-validator';
import DataModelValidator from './validators/datamodel-validator';
import DataSourceValidator from './validators/datasource-validator';
import EnumValidator from './validators/enum-validator';
import ExpressionValidator from './validators/expression-validator';
import FunctionDeclValidator from './validators/function-decl-validator';
import FunctionInvocationValidator from './validators/function-invocation-validator';
import ProcedureValidator from './validators/procedure-validator';
import SchemaValidator from './validators/schema-validator';
import TypeDefValidator from './validators/typedef-validator';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: ZModelServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ZModelValidator;
    const checks: ValidationChecks<ZModelAstType> = {
        Model: validator.checkModel,
        DataSource: validator.checkDataSource,
        GeneratorDecl: validator.checkGenerator,
        DataModel: validator.checkDataModel,
        TypeDef: validator.checkTypeDef,
        Enum: validator.checkEnum,
        Attribute: validator.checkAttribute,
        Expression: validator.checkExpression,
        InvocationExpr: validator.checkFunctionInvocation,
        FunctionDecl: validator.checkFunctionDecl,
        Procedure: validator.checkProcedure,
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class ZModelValidator {
    constructor(protected readonly services: ZModelServices) {}

    checkModel(node: Model, accept: ValidationAcceptor): void {
        new SchemaValidator(this.services.shared.workspace.LangiumDocuments).validate(node, accept);
    }

    checkDataSource(node: DataSource, accept: ValidationAcceptor): void {
        new DataSourceValidator().validate(node, accept);
    }

    checkGenerator(node: GeneratorDecl, accept: ValidationAcceptor): void {
        accept('warning', '"generator" is not used by ZenStack and should be removed.', { node });
    }

    checkDataModel(node: DataModel, accept: ValidationAcceptor): void {
        new DataModelValidator().validate(node, accept);
    }

    checkTypeDef(node: TypeDef, accept: ValidationAcceptor): void {
        new TypeDefValidator().validate(node, accept);
    }

    checkEnum(node: Enum, accept: ValidationAcceptor): void {
        new EnumValidator().validate(node, accept);
    }

    checkAttribute(node: Attribute, accept: ValidationAcceptor): void {
        new AttributeValidator().validate(node, accept);
    }

    checkExpression(node: Expression, accept: ValidationAcceptor): void {
        new ExpressionValidator().validate(node, accept);
    }

    checkFunctionInvocation(node: InvocationExpr, accept: ValidationAcceptor): void {
        new FunctionInvocationValidator().validate(node, accept);
    }

    checkFunctionDecl(node: FunctionDecl, accept: ValidationAcceptor): void {
        new FunctionDeclValidator().validate(node, accept);
    }

    checkProcedure(node: Procedure, accept: ValidationAcceptor): void {
        new ProcedureValidator().validate(node, accept);
    }
}
