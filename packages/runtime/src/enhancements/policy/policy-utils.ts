/* eslint-disable @typescript-eslint/no-explicit-any */

import deepcopy from 'deepcopy';
import { lowerCaseFirst } from 'lower-case-first';
import { upperCaseFirst } from 'upper-case-first';
import { fromZodError } from 'zod-validation-error';
import { AUXILIARY_FIELDS, CrudFailureReason, PrismaErrorCode } from '../../constants';
import { AuthUser, DbClientContract, DbOperations, FieldInfo, PolicyOperationKind } from '../../types';
import { getVersion } from '../../version';
import { getFields, resolveField } from '../model-meta';
import { NestedWriteVisitorContext } from '../nested-write-vistor';
import type { InputCheckFunc, ModelMeta, PolicyDef, PolicyFunc, ZodSchemas } from '../types';
import {
    enumerate,
    formatObject,
    getIdFields,
    getModelFields,
    prismaClientKnownRequestError,
    prismaClientUnknownRequestError,
    prismaClientValidationError,
} from '../utils';
import { Logger } from './logger';

/**
 * Access policy enforcement utilities
 */
export class PolicyUtil {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    private readonly logger: Logger;

    constructor(
        private readonly db: DbClientContract,
        private readonly modelMeta: ModelMeta,
        private readonly policy: PolicyDef,
        private readonly zodSchemas: ZodSchemas | undefined,
        private readonly user?: AuthUser,
        private readonly shouldLogQuery = false
    ) {
        this.logger = new Logger(db);
    }

    //#region Logical operators

    /**
     * Creates a conjunction of a list of query conditions.
     */
    and(...conditions: (boolean | object)[]): object {
        return this.reduce({ AND: conditions });
    }

    /**
     * Creates a disjunction of a list of query conditions.
     */
    or(...conditions: (boolean | object)[]): object {
        return this.reduce({ OR: conditions });
    }

    /**
     * Creates a negation of a query condition.
     */
    not(condition: object | boolean | undefined): object {
        if (condition === undefined) {
            return this.makeTrue();
        } else if (typeof condition === 'boolean') {
            return this.reduce(!condition);
        } else {
            return this.reduce({ NOT: condition });
        }
    }

    // Static True/False conditions
    // https://www.prisma.io/docs/concepts/components/prisma-client/null-and-undefined#the-effect-of-null-and-undefined-on-conditionals

    private isTrue(condition: object) {
        if (condition === null || condition === undefined) {
            return false;
        } else {
            return (
                (typeof condition === 'object' && Object.keys(condition).length === 0) ||
                ('AND' in condition && Array.isArray(condition.AND) && condition.AND.length === 0)
            );
        }
    }

    private isFalse(condition: object) {
        if (condition === null || condition === undefined) {
            return false;
        } else {
            return 'OR' in condition && Array.isArray(condition.OR) && condition.OR.length === 0;
        }
    }

    private makeTrue() {
        return { AND: [] };
    }

    private makeFalse() {
        return { OR: [] };
    }

    private reduce(condition: object | boolean | undefined): object {
        if (condition === true || condition === undefined) {
            return this.makeTrue();
        }

        if (condition === false) {
            return this.makeFalse();
        }

        if ('AND' in condition && Array.isArray(condition.AND)) {
            const children = condition.AND.map((c: any) => this.reduce(c)).filter(
                (c) => c !== undefined && !this.isTrue(c)
            );
            if (children.length === 0) {
                return this.makeTrue();
            } else if (children.some((c) => this.isFalse(c))) {
                return this.makeFalse();
            } else if (children.length === 1) {
                return children[0];
            } else {
                return { AND: children };
            }
        }

        if ('OR' in condition && Array.isArray(condition.OR)) {
            const children = condition.OR.map((c: any) => this.reduce(c)).filter(
                (c) => c !== undefined && !this.isFalse(c)
            );
            if (children.length === 0) {
                return this.makeFalse();
            } else if (children.some((c) => this.isTrue(c))) {
                return this.makeTrue();
            } else if (children.length === 1) {
                return children[0];
            } else {
                return { OR: children };
            }
        }

        if ('NOT' in condition && condition.NOT !== null && typeof condition.NOT === 'object') {
            const child = this.reduce(condition.NOT);
            if (this.isTrue(child)) {
                return this.makeFalse();
            } else if (this.isFalse(child)) {
                return this.makeTrue();
            } else {
                return { NOT: child };
            }
        }

        return condition;
    }

    //#endregion

    //# Auth guard

    /**
     * Gets pregenerated authorization guard object for a given model and operation.
     *
     * @returns true if operation is unconditionally allowed, false if unconditionally denied,
     * otherwise returns a guard object
     */
    getAuthGuard(model: string, operation: PolicyOperationKind, preValue?: any): object {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }

        const provider: PolicyFunc | boolean | undefined = guard[operation];
        if (typeof provider === 'boolean') {
            return this.reduce(provider);
        }

        if (!provider) {
            throw this.unknownError(`zenstack: unable to load authorization guard for ${model}`);
        }
        const r = provider({ user: this.user, preValue });
        return this.reduce(r);
    }

    /**
     * Checks if the given model has a policy guard for the given operation.
     */
    hasAuthGuard(model: string, operation: PolicyOperationKind): boolean {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            return false;
        }
        const provider: PolicyFunc | boolean | undefined = guard[operation];
        return typeof provider !== 'boolean' || provider !== true;
    }

    /**
     * Checks model creation policy based on static analysis to the input args.
     *
     * @returns boolean if static analysis is enough to determine the result, undefined if not
     */
    checkInputGuard(model: string, args: any, operation: 'create'): boolean | undefined {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            return undefined;
        }

        const provider: InputCheckFunc | boolean | undefined = guard[`${operation}_input` as const];

        if (typeof provider === 'boolean') {
            return provider;
        }

        if (!provider) {
            return undefined;
        }

        return provider(args, { user: this.user });
    }

    /**
     * Injects model auth guard as where clause.
     */
    async injectAuthGuard(args: any, model: string, operation: PolicyOperationKind) {
        const guard = this.getAuthGuard(model, operation);
        if (this.isFalse(guard)) {
            args.where = this.makeFalse();
            return false;
        }

        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            await this.injectGuardForRelationFields(model, args.where, operation);
        }

        args.where = this.and(args.where, guard);
        return true;
    }

    private async injectGuardForRelationFields(model: string, payload: any, operation: PolicyOperationKind) {
        for (const [field, subPayload] of Object.entries<any>(payload)) {
            if (!subPayload) {
                continue;
            }

            const fieldInfo = await resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel) {
                continue;
            }

            if (fieldInfo.isArray) {
                await this.injectGuardForToManyField(fieldInfo, subPayload, operation);
            } else {
                await this.injectGuardForToOneField(fieldInfo, subPayload, operation);
            }
        }
    }

    private async injectGuardForToManyField(
        fieldInfo: FieldInfo,
        payload: { some?: any; every?: any; none?: any },
        operation: PolicyOperationKind
    ) {
        const guard = this.getAuthGuard(fieldInfo.type, operation);
        if (payload.some) {
            await this.injectGuardForRelationFields(fieldInfo.type, payload.some, operation);
            // turn "some" into: { some: { AND: [guard, payload.some] } }
            payload.some = this.and(payload.some, guard);
        }
        if (payload.none) {
            await this.injectGuardForRelationFields(fieldInfo.type, payload.none, operation);
            // turn none into: { none: { AND: [guard, payload.none] } }
            payload.none = this.and(payload.none, guard);
        }
        if (
            payload.every &&
            typeof payload.every === 'object' &&
            // ignore empty every clause
            Object.keys(payload.every).length > 0
        ) {
            await this.injectGuardForRelationFields(fieldInfo.type, payload.every, operation);

            // turn "every" into: { none: { AND: [guard, { NOT: payload.every }] } }
            if (!payload.none) {
                payload.none = {};
            }
            payload.none = this.and(payload.none, guard, this.not(payload.every));
            delete payload.every;
        }
    }

    private async injectGuardForToOneField(
        fieldInfo: FieldInfo,
        payload: { is?: any; isNot?: any } & Record<string, any>,
        operation: PolicyOperationKind
    ) {
        const guard = this.getAuthGuard(fieldInfo.type, operation);
        if (payload.is || payload.isNot) {
            if (payload.is) {
                await this.injectGuardForRelationFields(fieldInfo.type, payload.is, operation);
                // turn "is" into: { is: { AND: [ originalIs, guard ] }
                payload.is = this.and(payload.is, guard);
            }
            if (payload.isNot) {
                await this.injectGuardForRelationFields(fieldInfo.type, payload.isNot, operation);
                // turn "isNot" into: { isNot: { AND: [ originalIsNot, { NOT: guard } ] } }
                payload.isNot = this.and(payload.isNot, this.not(guard));
                delete payload.isNot;
            }
        } else {
            await this.injectGuardForRelationFields(fieldInfo.type, payload, operation);
            // turn direct conditions into: { is: { AND: [ originalConditions, guard ] } }
            const combined = this.and(deepcopy(payload), guard);
            Object.keys(payload).forEach((key) => delete payload[key]);
            payload.is = combined;
        }
    }

    /**
     * Injects auth guard for read operations.
     */
    async injectForRead(model: string, args: any) {
        const injected: any = {};
        if (!(await this.injectAuthGuard(injected, model, 'read'))) {
            return false;
        }

        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            await this.injectGuardForRelationFields(model, args.where, 'read');
        }

        if (injected.where && Object.keys(injected.where).length > 0 && !this.isTrue(injected.where)) {
            args.where = args.where ?? {};
            Object.assign(args.where, injected.where);
        }

        // recursively inject read guard conditions into nested select, include, and _count
        const hoistedConditions = await this.injectNestedReadConditions(model, args);

        // the injection process may generate conditions that need to be hoisted to the toplevel,
        // if so, merge it with the existing where
        if (hoistedConditions.length > 0) {
            args.where = args.where ?? {};
            Object.assign(args.where, ...hoistedConditions);
        }

        return true;
    }

    // flatten unique constraint filters
    private flattenGeneratedUniqueField(model: string, args: any) {
        // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
        const uniqueConstraints = this.modelMeta.uniqueConstraints?.[lowerCaseFirst(model)];
        if (uniqueConstraints && Object.keys(uniqueConstraints).length > 0) {
            for (const [field, value] of Object.entries<any>(args)) {
                if (
                    uniqueConstraints[field] &&
                    uniqueConstraints[field].fields.length > 1 &&
                    typeof value === 'object'
                ) {
                    // multi-field unique constraint, flatten it
                    delete args[field];
                    for (const [f, v] of Object.entries(value)) {
                        args[f] = v;
                    }
                }
            }
        }
    }

    /**
     * Gets unique constraints for the given model.
     */
    getUniqueConstraints(model: string) {
        return this.modelMeta.uniqueConstraints?.[lowerCaseFirst(model)] ?? {};
    }

    /**
     * Builds a reversed query for the given nested path.
     */
    async buildReversedQuery(context: NestedWriteVisitorContext) {
        let result, currQuery: any;
        let currField: FieldInfo | undefined;

        for (let i = context.nestingPath.length - 1; i >= 0; i--) {
            const { field, model, where } = context.nestingPath[i];

            // never modify the original where because it's shared in the structure
            const visitWhere = { ...where };
            if (model && where) {
                // make sure composite unique condition is flattened
                this.flattenGeneratedUniqueField(model, visitWhere);
            }

            if (!result) {
                // first segment (bottom), just use its where clause
                result = currQuery = { ...visitWhere };
                currField = field;
            } else {
                if (!currField) {
                    throw this.unknownError(`missing field in nested path`);
                }
                if (!currField.backLink) {
                    throw this.unknownError(`field ${currField.type}.${currField.name} doesn't have a backLink`);
                }
                const backLinkField = this.getModelField(currField.type, currField.backLink);
                if (backLinkField?.isArray) {
                    // many-side of relationship, wrap with "some" query
                    currQuery[currField.backLink] = { some: { ...visitWhere } };
                } else {
                    if (where && backLinkField.isRelationOwner && backLinkField.foreignKeyMapping) {
                        for (const [r, fk] of Object.entries<string>(backLinkField.foreignKeyMapping)) {
                            currQuery[fk] = visitWhere[r];
                        }
                        if (i > 0) {
                            currQuery[currField.backLink] = {};
                        }
                    } else {
                        currQuery[currField.backLink] = { ...visitWhere };
                    }
                }
                currQuery = currQuery[currField.backLink];
                currField = field;
            }
        }
        return result;
    }

    private async injectNestedReadConditions(model: string, args: any): Promise<any[]> {
        const injectTarget = args.select ?? args.include;
        if (!injectTarget) {
            return [];
        }

        if (injectTarget._count !== undefined) {
            // _count needs to respect read policies of related models
            if (injectTarget._count === true) {
                // include count for all relations, expand to all fields
                // so that we can inject guard conditions for each of them
                injectTarget._count = { select: {} };
                const modelFields = getFields(this.modelMeta, model);
                if (modelFields) {
                    for (const [k, v] of Object.entries(modelFields)) {
                        if (v.isDataModel && v.isArray) {
                            // create an entry for to-many relation
                            injectTarget._count.select[k] = {};
                        }
                    }
                }
            }

            // inject conditions for each relation
            for (const field of Object.keys(injectTarget._count.select)) {
                if (typeof injectTarget._count.select[field] !== 'object') {
                    injectTarget._count.select[field] = {};
                }
                const fieldInfo = resolveField(this.modelMeta, model, field);
                if (!fieldInfo) {
                    continue;
                }
                // inject into the "where" clause inside select
                await this.injectAuthGuard(injectTarget._count.select[field], fieldInfo.type, 'read');
            }
        }

        // collect filter conditions that should be hoisted to the toplevel
        const hoistedConditions: any[] = [];

        for (const field of getModelFields(injectTarget)) {
            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel) {
                // only care about relation fields
                continue;
            }

            let hoisted: any;

            if (
                fieldInfo.isArray ||
                // Injecting where at include/select level for nullable to-one relation is supported since Prisma 4.8.0
                // https://github.com/prisma/prisma/discussions/20350
                fieldInfo.isOptional
            ) {
                if (typeof injectTarget[field] !== 'object') {
                    injectTarget[field] = {};
                }
                // inject extra condition for to-many or nullable to-one relation
                await this.injectAuthGuard(injectTarget[field], fieldInfo.type, 'read');
            } else {
                // hoist non-nullable to-one filter to the parent level
                hoisted = this.getAuthGuard(fieldInfo.type, 'read');
            }

            // recurse
            const subHoisted = await this.injectNestedReadConditions(fieldInfo.type, injectTarget[field]);

            if (subHoisted.length > 0) {
                hoisted = this.and(hoisted, ...subHoisted);
            }

            if (hoisted && !this.isTrue(hoisted)) {
                hoistedConditions.push({ [field]: hoisted });
            }
        }

        return hoistedConditions;
    }

    /**
     * Given a model and a unique filter, checks the operation is allowed by policies and field validations.
     * Rejects with an error if not allowed.
     */
    async checkPolicyForUnique(
        model: string,
        uniqueFilter: any,
        operation: PolicyOperationKind,
        db: Record<string, DbOperations>,
        preValue?: any
    ) {
        const guard = this.getAuthGuard(model, operation, preValue);
        if (this.isFalse(guard)) {
            throw this.deniedByPolicy(model, operation, `entity ${formatObject(uniqueFilter)} failed policy check`);
        }

        // Zod schema is to be checked for "create" and "postUpdate"
        const schema = ['create', 'postUpdate'].includes(operation) ? this.getZodSchema(model) : undefined;

        if (this.isTrue(guard) && !schema) {
            // unconditionally allowed
            return;
        }

        const select = schema
            ? // need to validate against schema, need to fetch all fields
              undefined
            : // only fetch id fields
              this.makeIdSelection(model);

        let where = this.clone(uniqueFilter);
        // query args may have be of combined-id form, need to flatten it to call findFirst
        this.flattenGeneratedUniqueField(model, where);

        // query with policy guard
        where = this.and(where, guard);
        const query = { select, where };

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] checking ${model} for ${operation}, \`findFirst\`:\n${formatObject(query)}`);
        }
        const result = await db[model].findFirst(query);
        if (!result) {
            throw this.deniedByPolicy(model, operation, `entity ${formatObject(uniqueFilter)} failed policy check`);
        }

        if (schema) {
            // TODO: push down schema check to the database
            const parseResult = schema.safeParse(result);
            if (!parseResult.success) {
                const error = fromZodError(parseResult.error);
                if (this.logger.enabled('info')) {
                    this.logger.info(`entity ${model} failed validation for operation ${operation}: ${error}`);
                }
                throw this.deniedByPolicy(
                    model,
                    operation,
                    `entities ${JSON.stringify(uniqueFilter)} failed validation: [${error}]`,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION
                );
            }
        }
    }

    /**
     * Tries rejecting a request based on static "false" policy.
     */
    tryReject(model: string, operation: PolicyOperationKind) {
        const guard = this.getAuthGuard(model, operation);
        if (this.isFalse(guard)) {
            throw this.deniedByPolicy(model, operation);
        }
    }

    /**
     * Checks if a model exists given a unique filter.
     */
    async checkExistence(
        db: Record<string, DbOperations>,
        model: string,
        uniqueFilter: any,
        throwIfNotFound = false
    ): Promise<any> {
        uniqueFilter = this.clone(uniqueFilter);
        this.flattenGeneratedUniqueField(model, uniqueFilter);

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] checking ${model} existence, \`findFirst\`:\n${formatObject(uniqueFilter)}`);
        }
        const existing = await db[model].findFirst({
            where: uniqueFilter,
            select: this.makeIdSelection(model),
        });
        if (!existing && throwIfNotFound) {
            throw this.notFound(model);
        }
        return existing;
    }

    /**
     * Returns an entity given a unique filter with read policy checked. Reject if not readable.
     */
    async readBack(
        db: Record<string, DbOperations>,
        model: string,
        operation: PolicyOperationKind,
        selectInclude: { select?: any; include?: any },
        uniqueFilter: any
    ): Promise<{ result: unknown; error?: Error }> {
        uniqueFilter = this.clone(uniqueFilter);
        this.flattenGeneratedUniqueField(model, uniqueFilter);
        const readArgs = { select: selectInclude.select, include: selectInclude.include, where: uniqueFilter };
        const error = this.deniedByPolicy(
            model,
            operation,
            'result is not allowed to be read back',
            CrudFailureReason.RESULT_NOT_READABLE
        );

        const injectResult = await this.injectForRead(model, readArgs);
        if (!injectResult) {
            return { error, result: undefined };
        }

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] checking read-back, \`findFirst\` ${model}:\n${formatObject(readArgs)}`);
        }
        const result = await db[model].findFirst(readArgs);
        if (!result) {
            return { error, result: undefined };
        }

        this.postProcessForRead(result);
        return { result, error: undefined };
    }

    //#endregion

    //#region Errors

    deniedByPolicy(model: string, operation: PolicyOperationKind, extra?: string, reason?: CrudFailureReason) {
        return prismaClientKnownRequestError(
            this.db,
            `denied by policy: ${model} entities failed '${operation}' check${extra ? ', ' + extra : ''}`,
            { clientVersion: getVersion(), code: PrismaErrorCode.CONSTRAINED_FAILED, meta: { reason } }
        );
    }

    notFound(model: string) {
        return prismaClientKnownRequestError(this.db, `entity not found for model ${model}`, {
            clientVersion: getVersion(),
            code: 'P2025',
        });
    }

    validationError(message: string) {
        return prismaClientValidationError(this.db, message, {
            clientVersion: getVersion(),
        });
    }

    unknownError(message: string) {
        return prismaClientUnknownRequestError(this.db, message, {
            clientVersion: getVersion(),
        });
    }

    //#endregion

    //#region Misc

    /**
     * Gets field selection for fetching pre-update entity values for the given model.
     */
    getPreValueSelect(model: string): object | undefined {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        return guard.preValueSelect;
    }

    private hasFieldValidation(model: string): boolean {
        return this.policy.validation?.[lowerCaseFirst(model)]?.hasValidation === true;
    }

    /**
     * Gets Zod schema for the given model and access kind.
     *
     * @param kind If undefined, returns the full schema.
     */
    getZodSchema(model: string, kind: 'create' | 'update' | undefined = undefined) {
        if (!this.hasFieldValidation(model)) {
            return undefined;
        }
        const schemaKey = `${upperCaseFirst(model)}${kind ? upperCaseFirst(kind) : ''}Schema`;
        return this.zodSchemas?.models?.[schemaKey];
    }

    /**
     * Post processing checks and clean-up for read model entities.
     */
    postProcessForRead(data: any) {
        if (data === null || data === undefined) {
            return;
        }

        for (const entityData of enumerate(data)) {
            if (typeof entityData !== 'object' || !entityData) {
                return;
            }

            // strip auxiliary fields
            for (const auxField of AUXILIARY_FIELDS) {
                if (auxField in entityData) {
                    delete entityData[auxField];
                }
            }

            for (const fieldData of Object.values(entityData)) {
                if (typeof fieldData !== 'object' || !fieldData) {
                    continue;
                }
                this.postProcessForRead(fieldData);
            }
        }
    }

    /**
     * Gets information for a specific model field.
     */
    getModelField(model: string, field: string) {
        model = lowerCaseFirst(model);
        return this.modelMeta.fields[model]?.[field];
    }

    /**
     * Clones an object and makes sure it's not empty.
     */
    clone(value: unknown): any {
        return value ? deepcopy(value) : {};
    }

    /**
     * Gets "id" fields for a given model.
     */
    getIdFields(model: string) {
        return getIdFields(this.modelMeta, model, true);
    }

    /**
     * Gets id field values from an entity.
     */
    getEntityIds(model: string, entityData: any) {
        const idFields = this.getIdFields(model);
        const result: Record<string, unknown> = {};
        for (const idField of idFields) {
            result[idField.name] = entityData[idField.name];
        }
        return result;
    }

    /**
     * Creates a selection object for id fields for the given model.
     */
    makeIdSelection(model: string) {
        const idFields = this.getIdFields(model);
        return Object.assign({}, ...idFields.map((f) => ({ [f.name]: true })));
    }

    //#endregion
}
