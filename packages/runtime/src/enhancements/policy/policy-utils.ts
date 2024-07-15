/* eslint-disable @typescript-eslint/no-explicit-any */

import deepmerge from 'deepmerge';
import { lowerCaseFirst } from 'lower-case-first';
import { upperCaseFirst } from 'upper-case-first';
import { z, type ZodError, type ZodObject, type ZodSchema } from 'zod';
import { fromZodError } from 'zod-validation-error';
import { CrudFailureReason, PrismaErrorCode } from '../../constants';
import {
    clone,
    enumerate,
    getFields,
    getModelFields,
    resolveField,
    zip,
    type FieldInfo,
    type ModelMeta,
} from '../../cross';
import {
    AuthUser,
    CrudContract,
    DbClientContract,
    PolicyCrudKind,
    PolicyOperationKind,
    QueryContext,
} from '../../types';
import { getVersion } from '../../version';
import type { EnhancementContext, InternalEnhancementOptions } from '../create-enhancement';
import { Logger } from '../logger';
import { QueryUtils } from '../query-utils';
import type { EntityChecker, ModelPolicyDef, PermissionCheckerFunc, PolicyDef, PolicyFunc, ZodSchemas } from '../types';
import { formatObject, prismaClientKnownRequestError } from '../utils';

/**
 * Access policy enforcement utilities
 */
export class PolicyUtil extends QueryUtils {
    private readonly logger: Logger;
    private readonly modelMeta: ModelMeta;
    private readonly policy: PolicyDef;
    private readonly zodSchemas?: ZodSchemas;
    private readonly prismaModule: any;
    private readonly user?: AuthUser;

    constructor(
        private readonly db: DbClientContract,
        options: InternalEnhancementOptions,
        context?: EnhancementContext,
        private readonly shouldLogQuery = false
    ) {
        super(db, options);

        this.logger = new Logger(db);
        this.user = context?.user;

        ({
            modelMeta: this.modelMeta,
            policy: this.policy,
            zodSchemas: this.zodSchemas,
            prismaModule: this.prismaModule,
        } = options);
    }

    //#region Logical operators

    /**
     * Creates a conjunction of a list of query conditions.
     */
    and(...conditions: (boolean | object | undefined)[]): object {
        const filtered = conditions.filter((c) => c !== undefined);
        if (filtered.length === 0) {
            return this.makeTrue();
        } else if (filtered.length === 1) {
            return this.reduce(filtered[0]);
        } else {
            return this.reduce({ AND: filtered });
        }
    }

    /**
     * Creates a disjunction of a list of query conditions.
     */
    or(...conditions: (boolean | object | undefined)[]): object {
        const filtered = conditions.filter((c) => c !== undefined);
        if (filtered.length === 0) {
            return this.makeFalse();
        } else if (filtered.length === 1) {
            return this.reduce(filtered[0]);
        } else {
            return this.reduce({ OR: filtered });
        }
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

    public isTrue(condition: object) {
        if (condition === null || condition === undefined) {
            return false;
        } else {
            return (
                (typeof condition === 'object' && Object.keys(condition).length === 0) ||
                ('AND' in condition && Array.isArray(condition.AND) && condition.AND.length === 0)
            );
        }
    }

    public isFalse(condition: object) {
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

        if (condition === null) {
            return condition;
        }

        const result: any = {};
        for (const [key, value] of Object.entries<any>(condition)) {
            if (this.isFalse(result)) {
                // already false, no need to continue
                break;
            }

            if (value === null || value === undefined) {
                result[key] = value;
                continue;
            }

            switch (key) {
                case 'AND': {
                    const children = enumerate(value)
                        .map((c: any) => this.reduce(c))
                        .filter((c) => c !== undefined && !this.isTrue(c));
                    if (children.length === 0) {
                        result[key] = []; // true
                    } else if (children.some((c) => this.isFalse(c))) {
                        result['OR'] = []; // false
                    } else {
                        if (!this.isTrue({ AND: result[key] })) {
                            // use AND only if it's not already true
                            result[key] = !Array.isArray(value) && children.length === 1 ? children[0] : children;
                        }
                    }
                    break;
                }

                case 'OR': {
                    const children = enumerate(value)
                        .map((c: any) => this.reduce(c))
                        .filter((c) => c !== undefined && !this.isFalse(c));
                    if (children.length === 0) {
                        result[key] = []; // false
                    } else if (children.some((c) => this.isTrue(c))) {
                        result['AND'] = []; // true
                    } else {
                        if (!this.isFalse({ OR: result[key] })) {
                            // use OR only if it's not already false
                            result[key] = !Array.isArray(value) && children.length === 1 ? children[0] : children;
                        }
                    }
                    break;
                }

                case 'NOT': {
                    const children = enumerate(value)
                        .map((c: any) => this.reduce(c))
                        .filter((c) => c !== undefined && !this.isFalse(c));
                    if (children.length === 0) {
                        // all clauses are false, result is a constant true,
                        // thus eliminated (not adding into result)
                    } else if (children.some((c) => this.isTrue(c))) {
                        // some clauses are true, result is a constant false,
                        // eliminate all other keys and set entire condition to false
                        Object.keys(result).forEach((k) => delete result[k]);
                        result['OR'] = []; // this will cause the outer loop to exit too
                    } else {
                        result[key] = !Array.isArray(value) && children.length === 1 ? children[0] : children;
                    }
                    break;
                }

                default: {
                    const booleanKeys = ['AND', 'OR', 'NOT', 'is', 'isNot', 'none', 'every', 'some'];
                    if (
                        typeof value === 'object' &&
                        value &&
                        // recurse only if the value has at least one boolean key
                        Object.keys(value).some((k) => booleanKeys.includes(k))
                    ) {
                        result[key] = this.reduce(value);
                    } else {
                        result[key] = value;
                    }
                    break;
                }
            }
        }

        return result;
    }

    //#endregion

    //#region Auth guard

    private readonly FULL_OPEN_MODEL_POLICY: ModelPolicyDef = {
        modelLevel: {
            read: { guard: true },
            create: { guard: true, inputChecker: true },
            update: { guard: true },
            delete: { guard: true },
            postUpdate: { guard: true },
        },
    };

    private getModelPolicyDef(model: string): ModelPolicyDef {
        if (this.options.kinds && !this.options.kinds.includes('policy')) {
            // policy enhancement not enabled, return an fully open guard
            return this.FULL_OPEN_MODEL_POLICY;
        }

        const def = this.policy.policy[lowerCaseFirst(model)];
        if (!def) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        return def;
    }

    private getModelGuardForOperation(model: string, operation: PolicyOperationKind): PolicyFunc | boolean {
        const def = this.getModelPolicyDef(model);
        return def.modelLevel[operation].guard ?? true;
    }

    /**
     * Gets pregenerated authorization guard object for a given model and operation.
     *
     * @returns true if operation is unconditionally allowed, false if unconditionally denied,
     * otherwise returns a guard object
     */
    getAuthGuard(db: CrudContract, model: string, operation: PolicyOperationKind, preValue?: any) {
        const guard = this.getModelGuardForOperation(model, operation);

        // constant guard
        if (typeof guard === 'boolean') {
            return this.reduce(guard);
        }

        // invoke guard function
        const r = guard({ user: this.user, preValue }, db);
        return this.reduce(r);
    }

    /**
     * Get field-level read auth guard
     */
    getFieldReadAuthGuard(db: CrudContract, model: string, field: string) {
        const def = this.getModelPolicyDef(model);
        const guard = def.fieldLevel?.read?.[field]?.guard;

        if (guard === undefined) {
            // field access is allowed by default
            return this.makeTrue();
        }

        if (typeof guard === 'boolean') {
            return this.reduce(guard);
        }

        const r = guard({ user: this.user }, db);
        return this.reduce(r);
    }

    /**
     * Get field-level read auth guard that overrides the model-level
     */
    getFieldOverrideReadAuthGuard(db: CrudContract, model: string, field: string) {
        const def = this.getModelPolicyDef(model);
        const guard = def.fieldLevel?.read?.[field]?.overrideGuard;

        if (guard === undefined) {
            // field access is denied by default in override mode
            return this.makeFalse();
        }

        if (typeof guard === 'boolean') {
            return this.reduce(guard);
        }

        const r = guard({ user: this.user }, db);
        return this.reduce(r);
    }

    /**
     * Get field-level update auth guard
     */
    getFieldUpdateAuthGuard(db: CrudContract, model: string, field: string) {
        const def = this.getModelPolicyDef(model);
        const guard = def.fieldLevel?.update?.[field]?.guard;

        if (guard === undefined) {
            // field access is allowed by default
            return this.makeTrue();
        }

        if (typeof guard === 'boolean') {
            return this.reduce(guard);
        }

        const r = guard({ user: this.user }, db);
        return this.reduce(r);
    }

    /**
     * Get field-level update auth guard that overrides the model-level
     */
    getFieldOverrideUpdateAuthGuard(db: CrudContract, model: string, field: string) {
        const def = this.getModelPolicyDef(model);
        const guard = def.fieldLevel?.update?.[field]?.overrideGuard;

        if (guard === undefined) {
            // field access is denied by default in override mode
            return this.makeFalse();
        }

        if (typeof guard === 'boolean') {
            return this.reduce(guard);
        }

        const r = guard({ user: this.user }, db);
        return this.reduce(r);
    }

    /**
     * Checks if the given model has a policy guard for the given operation.
     */
    hasAuthGuard(model: string, operation: PolicyOperationKind) {
        const guard = this.getModelGuardForOperation(model, operation);
        return typeof guard !== 'boolean' || guard !== true;
    }

    /**
     * Checks if the given model has any field-level override policy guard for the given operation.
     */
    hasOverrideAuthGuard(model: string, operation: PolicyOperationKind) {
        if (operation !== 'read' && operation !== 'update') {
            return false;
        }
        const def = this.getModelPolicyDef(model);
        if (def.fieldLevel?.[operation]) {
            return Object.values(def.fieldLevel[operation]).some(
                (f) => f.overrideGuard !== undefined || f.overrideEntityChecker !== undefined
            );
        } else {
            return false;
        }
    }

    /**
     * Checks model creation policy based on static analysis to the input args.
     *
     * @returns boolean if static analysis is enough to determine the result, undefined if not
     */
    checkInputGuard(model: string, args: any, operation: 'create'): boolean | undefined {
        const def = this.getModelPolicyDef(model);

        const guard = def.modelLevel[operation].inputChecker;
        if (guard === undefined) {
            return undefined;
        }

        if (typeof guard === 'boolean') {
            return guard;
        }

        return guard(args, { user: this.user });
    }

    /**
     * Injects model auth guard as where clause.
     */
    injectAuthGuardAsWhere(db: CrudContract, args: any, model: string, operation: PolicyOperationKind) {
        let guard = this.getAuthGuard(db, model, operation);

        if (operation === 'update' && args) {
            // merge field-level policy guards
            const fieldUpdateGuard = this.getFieldUpdateGuards(db, model, args);
            if (fieldUpdateGuard.rejectedByField) {
                // rejected
                args.where = this.makeFalse();
                return false;
            } else {
                if (fieldUpdateGuard.guard) {
                    // merge field-level guard
                    guard = this.and(guard, fieldUpdateGuard.guard);
                }

                if (fieldUpdateGuard.overrideGuard) {
                    // merge field-level override guard on the top level
                    guard = this.or(guard, fieldUpdateGuard.overrideGuard);
                }
            }
        }

        if (operation === 'read') {
            // merge field-level read override guards
            const fieldReadOverrideGuard = this.getFieldReadGuards(db, model, args);
            if (fieldReadOverrideGuard) {
                guard = this.or(guard, fieldReadOverrideGuard);
            }
        }

        if (this.isFalse(guard)) {
            args.where = this.makeFalse();
            return false;
        }

        let mergedGuard = guard;
        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            mergedGuard = this.injectReadGuardForRelationFields(db, model, args.where, guard);
        }

        args.where = this.and(args.where, mergedGuard);
        return true;
    }

    // Injects guard for relation fields nested in `payload`. The `modelGuard` parameter represents the model-level guard for `model`.
    // The function returns a modified copy of `modelGuard` with field-level policies combined.
    private injectReadGuardForRelationFields(db: CrudContract, model: string, payload: any, modelGuard: any) {
        if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
            return modelGuard;
        }

        const allFieldGuards: object[] = [];
        const allFieldOverrideGuards: object[] = [];

        for (const [field, subPayload] of Object.entries<any>(payload)) {
            if (!subPayload) {
                continue;
            }

            allFieldGuards.push(this.getFieldReadAuthGuard(db, model, field));
            allFieldOverrideGuards.push(this.getFieldOverrideReadAuthGuard(db, model, field));

            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (fieldInfo?.isDataModel) {
                if (fieldInfo.isArray) {
                    this.injectReadGuardForToManyField(db, fieldInfo, subPayload);
                } else {
                    this.injectReadGuardForToOneField(db, fieldInfo, subPayload);
                }
            }
        }

        // all existing field-level guards must be true
        const mergedGuard: object = this.and(...allFieldGuards);

        // all existing field-level override guards must be true for override to take effect; override is disabled by default
        const mergedOverrideGuard: object =
            allFieldOverrideGuards.length === 0 ? this.makeFalse() : this.and(...allFieldOverrideGuards);

        // (original-guard && field-level-guard) || field-level-override-guard
        const updatedGuard = this.or(this.and(modelGuard, mergedGuard), mergedOverrideGuard);
        return updatedGuard;
    }

    private injectReadGuardForToManyField(
        db: CrudContract,
        fieldInfo: FieldInfo,
        payload: { some?: any; every?: any; none?: any }
    ) {
        const guard = this.getAuthGuard(db, fieldInfo.type, 'read');
        if (payload.some) {
            const mergedGuard = this.injectReadGuardForRelationFields(db, fieldInfo.type, payload.some, guard);
            // turn "some" into: { some: { AND: [guard, payload.some] } }
            payload.some = this.and(payload.some, mergedGuard);
        }
        if (payload.none) {
            const mergedGuard = this.injectReadGuardForRelationFields(db, fieldInfo.type, payload.none, guard);
            // turn none into: { none: { AND: [guard, payload.none] } }
            payload.none = this.and(payload.none, mergedGuard);
        }
        if (
            payload.every &&
            typeof payload.every === 'object' &&
            // ignore empty every clause
            Object.keys(payload.every).length > 0
        ) {
            const mergedGuard = this.injectReadGuardForRelationFields(db, fieldInfo.type, payload.every, guard);

            // turn "every" into: { none: { AND: [guard, { NOT: payload.every }] } }
            if (!payload.none) {
                payload.none = {};
            }
            payload.none = this.and(payload.none, mergedGuard, this.not(payload.every));
            delete payload.every;
        }
    }

    private injectReadGuardForToOneField(
        db: CrudContract,
        fieldInfo: FieldInfo,
        payload: { is?: any; isNot?: any } & Record<string, any>
    ) {
        const guard = this.getAuthGuard(db, fieldInfo.type, 'read');

        // is|isNot and flat fields conditions are mutually exclusive

        // is and isNot can be null value

        if (payload.is !== undefined || payload.isNot !== undefined) {
            if (payload.is) {
                const mergedGuard = this.injectReadGuardForRelationFields(db, fieldInfo.type, payload.is, guard);
                // merge guard with existing "is": { is: { AND: [originalIs, guard] } }
                payload.is = this.and(payload.is, mergedGuard);
            }

            if (payload.isNot) {
                const mergedGuard = this.injectReadGuardForRelationFields(db, fieldInfo.type, payload.isNot, guard);
                // merge guard with existing "isNot":  { isNot: { AND: [originalIsNot, guard] } }
                payload.isNot = this.and(payload.isNot, mergedGuard);
            }
        } else {
            const mergedGuard = this.injectReadGuardForRelationFields(db, fieldInfo.type, payload, guard);
            // turn direct conditions into: { is: { AND: [ originalConditions, guard ] } }
            const combined = this.and(clone(payload), mergedGuard);
            Object.keys(payload).forEach((key) => delete payload[key]);
            payload.is = combined;
        }
    }

    /**
     * Injects auth guard for read operations.
     */
    injectForRead(db: CrudContract, model: string, args: any) {
        // make select and include visible to the injection
        const injected: any = { select: args.select, include: args.include };
        if (!this.injectAuthGuardAsWhere(db, injected, model, 'read')) {
            return false;
        }

        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            this.injectReadGuardForRelationFields(db, model, args.where, {});
        }

        if (injected.where && Object.keys(injected.where).length > 0 && !this.isTrue(injected.where)) {
            if (!args.where) {
                args.where = injected.where;
            } else {
                this.mergeWhereClause(args.where, injected.where);
            }
        }

        // recursively inject read guard conditions into nested select, include, and _count
        const hoistedConditions = this.injectNestedReadConditions(db, model, args);

        // the injection process may generate conditions that need to be hoisted to the toplevel,
        // if so, merge it with the existing where
        if (hoistedConditions.length > 0) {
            if (!args.where) {
                args.where = this.and(...hoistedConditions);
            } else {
                this.mergeWhereClause(args.where, this.and(...hoistedConditions));
            }
        }

        return true;
    }

    //#endregion

    //#region Checker

    /**
     * Gets checker constraints for the given model and operation.
     */
    getCheckerConstraint(model: string, operation: PolicyCrudKind): ReturnType<PermissionCheckerFunc> | boolean {
        if (this.options.kinds && !this.options.kinds.includes('policy')) {
            // policy enhancement not enabled, return a constant true checker result
            return true;
        }

        const def = this.getModelPolicyDef(model);
        const checker = def.modelLevel[operation].permissionChecker;
        if (checker === undefined) {
            throw new Error(
                `Generated permission checkers not found. Please make sure the "generatePermissionChecker" option is set to true in the "@core/enhancer" plugin.`
            );
        }

        if (typeof checker === 'boolean') {
            return checker;
        }

        if (typeof checker !== 'function') {
            throw this.unknownError(`invalid ${operation} checker function for ${model}`);
        }

        // call checker function
        return checker({ user: this.user });
    }

    //#endregion

    /**
     * Gets unique constraints for the given model.
     */
    getUniqueConstraints(model: string) {
        return this.modelMeta.models[lowerCaseFirst(model)]?.uniqueConstraints ?? {};
    }

    private injectNestedReadConditions(db: CrudContract, model: string, args: any): any[] {
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
                this.injectAuthGuardAsWhere(db, injectTarget._count.select[field], fieldInfo.type, 'read');
            }
        }

        // collect filter conditions that should be hoisted to the toplevel
        const hoistedConditions: any[] = [];

        for (const field of getModelFields(injectTarget)) {
            if (injectTarget[field] === false) {
                continue;
            }

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
                this.injectAuthGuardAsWhere(db, injectTarget[field], fieldInfo.type, 'read');

                // recurse
                const subHoisted = this.injectNestedReadConditions(db, fieldInfo.type, injectTarget[field]);
                if (subHoisted.length > 0) {
                    // we can convert it to a where at this level
                    injectTarget[field].where = this.and(injectTarget[field].where, ...subHoisted);
                }
            } else {
                // hoist non-nullable to-one filter to the parent level
                let injected = this.safeClone(injectTarget[field]);
                if (typeof injected !== 'object') {
                    injected = {};
                }
                this.injectAuthGuardAsWhere(db, injected, fieldInfo.type, 'read');
                hoisted = injected.where;

                // recurse
                const subHoisted = this.injectNestedReadConditions(db, fieldInfo.type, injectTarget[field]);
                if (subHoisted.length > 0) {
                    hoisted = this.and(hoisted, ...subHoisted);
                }
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
        db: CrudContract,
        args: any,
        preValue?: any
    ) {
        let guard = this.getAuthGuard(db, model, operation, preValue);
        if (this.isFalse(guard) && !this.hasOverrideAuthGuard(model, operation)) {
            throw this.deniedByPolicy(
                model,
                operation,
                `entity ${formatObject(uniqueFilter, false)} failed policy check`,
                CrudFailureReason.ACCESS_POLICY_VIOLATION
            );
        }

        let entityChecker: EntityChecker | undefined;

        if (operation === 'update' && args) {
            // merge field-level policy guards
            const fieldUpdateGuard = this.getFieldUpdateGuards(db, model, args);
            if (fieldUpdateGuard.rejectedByField) {
                // rejected
                throw this.deniedByPolicy(
                    model,
                    'update',
                    `entity ${formatObject(uniqueFilter, false)} failed update policy check for field "${
                        fieldUpdateGuard.rejectedByField
                    }"`,
                    CrudFailureReason.ACCESS_POLICY_VIOLATION
                );
            }

            if (fieldUpdateGuard.guard) {
                // merge field-level guard with AND
                guard = this.and(guard, fieldUpdateGuard.guard);
            }

            if (fieldUpdateGuard.overrideGuard) {
                // merge field-level override guard with OR
                guard = this.or(guard, fieldUpdateGuard.overrideGuard);
            }

            // field-level entity checker
            entityChecker = fieldUpdateGuard.entityChecker;
        }

        // Zod schema is to be checked for "create" and "postUpdate"
        const schema = ['create', 'postUpdate'].includes(operation) ? this.getZodSchema(model) : undefined;

        // combine field-level entity checker with model-level
        const modelEntityChecker = this.getEntityChecker(model, operation);
        entityChecker = this.combineEntityChecker(entityChecker, modelEntityChecker, 'and');

        if (this.isTrue(guard) && !schema && !entityChecker) {
            // unconditionally allowed
            return;
        }

        let select = schema
            ? // need to validate against schema, need to fetch all fields
              undefined
            : // only fetch id fields
              this.makeIdSelection(model);

        if (entityChecker?.selector) {
            if (!select) {
                select = this.makeAllScalarFieldSelect(model);
            }
            select = { ...select, ...entityChecker.selector };
        }

        let where = this.safeClone(uniqueFilter);
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
            throw this.deniedByPolicy(
                model,
                operation,
                `entity ${formatObject(uniqueFilter, false)} failed policy check`,
                CrudFailureReason.ACCESS_POLICY_VIOLATION
            );
        }

        if (entityChecker) {
            if (this.logger.enabled('info')) {
                this.logger.info(`[policy] running entity checker on ${model} for ${operation}`);
            }
            if (!entityChecker.func(result, { user: this.user, preValue })) {
                throw this.deniedByPolicy(
                    model,
                    operation,
                    `entity ${formatObject(uniqueFilter, false)} failed policy check`,
                    CrudFailureReason.ACCESS_POLICY_VIOLATION
                );
            }
        }

        if (schema) {
            // TODO: push down schema check to the database
            this.validateZodSchema(model, undefined, result, true, (err) => {
                throw this.deniedByPolicy(
                    model,
                    operation,
                    `entity ${formatObject(uniqueFilter, false)} failed validation: [${fromZodError(err)}]`,
                    CrudFailureReason.DATA_VALIDATION_VIOLATION,
                    err
                );
            });
        }
    }

    getEntityChecker(model: string, operation: PolicyOperationKind, field?: string) {
        const def = this.getModelPolicyDef(model);
        if (field) {
            return def.fieldLevel?.[operation as 'read' | 'update']?.[field]?.entityChecker;
        } else {
            return def.modelLevel[operation].entityChecker;
        }
    }

    getUpdateOverrideEntityCheckerForField(model: string, field: string) {
        const def = this.getModelPolicyDef(model);
        return def.fieldLevel?.update?.[field]?.overrideEntityChecker;
    }

    private getFieldReadGuards(db: CrudContract, model: string, args: { select?: any; include?: any }) {
        const allFields = Object.values(getFields(this.modelMeta, model));

        // all scalar fields by default
        let fields = allFields.filter((f) => !f.isDataModel);

        if (args.select) {
            // explicitly selected fields
            fields = allFields.filter((f) => args.select?.[f.name] === true);
        } else if (args.include) {
            // included relations
            fields.push(...allFields.filter((f) => !fields.includes(f) && args.include[f.name]));
        }

        if (fields.length === 0) {
            // this can happen if only selecting pseudo fields like "_count"
            return undefined;
        }

        const allFieldGuards = fields.map((field) => this.getFieldOverrideReadAuthGuard(db, model, field.name));
        return this.and(...allFieldGuards);
    }

    private getFieldUpdateGuards(db: CrudContract, model: string, args: any) {
        const allFieldGuards = [];
        const allOverrideFieldGuards = [];
        let entityChecker: EntityChecker | undefined;

        for (const [field, value] of Object.entries<any>(args.data ?? args)) {
            if (typeof value === 'undefined') {
                continue;
            }

            const fieldInfo = resolveField(this.modelMeta, model, field);

            if (fieldInfo?.isDataModel) {
                // relation field update should be treated as foreign key update,
                // fetch and merge all foreign key guards
                if (fieldInfo.isRelationOwner && fieldInfo.foreignKeyMapping) {
                    const foreignKeys = Object.values<string>(fieldInfo.foreignKeyMapping);
                    for (const fk of foreignKeys) {
                        const fieldGuard = this.getFieldUpdateAuthGuard(db, model, fk);
                        if (this.isFalse(fieldGuard)) {
                            return { guard: fieldGuard, rejectedByField: fk };
                        }

                        // add field guard
                        allFieldGuards.push(fieldGuard);

                        // add field override guard
                        const overrideFieldGuard = this.getFieldOverrideUpdateAuthGuard(db, model, fk);
                        allOverrideFieldGuards.push(overrideFieldGuard);
                    }
                }
            } else {
                const fieldGuard = this.getFieldUpdateAuthGuard(db, model, field);
                if (this.isFalse(fieldGuard)) {
                    return { guard: fieldGuard, rejectedByField: field };
                }

                // add field guard
                allFieldGuards.push(fieldGuard);

                // add field override guard
                const overrideFieldGuard = this.getFieldOverrideUpdateAuthGuard(db, model, field);
                allOverrideFieldGuards.push(overrideFieldGuard);
            }

            // merge regular and override entity checkers with OR
            let checker = this.getEntityChecker(model, 'update', field);
            const overrideChecker = this.getUpdateOverrideEntityCheckerForField(model, field);
            checker = this.combineEntityChecker(checker, overrideChecker, 'or');

            // accumulate entity checker across fields
            entityChecker = this.combineEntityChecker(entityChecker, checker, 'and');
        }

        const allFieldsCombined = this.and(...allFieldGuards);
        const allOverrideFieldsCombined =
            allOverrideFieldGuards.length !== 0 ? this.and(...allOverrideFieldGuards) : undefined;

        return {
            guard: allFieldsCombined,
            overrideGuard: allOverrideFieldsCombined,
            rejectedByField: undefined,
            entityChecker,
        };
    }

    private combineEntityChecker(
        left: EntityChecker | undefined,
        right: EntityChecker | undefined,
        combiner: 'and' | 'or'
    ): EntityChecker | undefined {
        if (!left) {
            return right;
        }

        if (!right) {
            return left;
        }

        const func =
            combiner === 'and'
                ? (entity: any, context: QueryContext) => left.func(entity, context) && right.func(entity, context)
                : (entity: any, context: QueryContext) => left.func(entity, context) || right.func(entity, context);

        return {
            func,
            selector: deepmerge(left.selector ?? {}, right.selector ?? {}),
        };
    }

    /**
     * Tries rejecting a request based on static "false" policy.
     */
    tryReject(db: CrudContract, model: string, operation: PolicyOperationKind) {
        const guard = this.getAuthGuard(db, model, operation);
        if (this.isFalse(guard) && !this.hasOverrideAuthGuard(model, operation)) {
            throw this.deniedByPolicy(model, operation, undefined, CrudFailureReason.ACCESS_POLICY_VIOLATION);
        }
    }

    /**
     * Checks if a model exists given a unique filter.
     */
    async checkExistence(db: CrudContract, model: string, uniqueFilter: any, throwIfNotFound = false): Promise<any> {
        uniqueFilter = this.safeClone(uniqueFilter);
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
        db: CrudContract,
        model: string,
        operation: PolicyOperationKind,
        selectInclude: { select?: any; include?: any },
        uniqueFilter: any
    ): Promise<{ result: unknown; error?: Error }> {
        uniqueFilter = this.safeClone(uniqueFilter);
        this.flattenGeneratedUniqueField(model, uniqueFilter);

        // make sure only select and include are picked
        const selectIncludeClean = this.pick(selectInclude, 'select', 'include');
        const readArgs = {
            ...this.safeClone(selectIncludeClean),
            where: uniqueFilter,
        };

        const error = this.deniedByPolicy(
            model,
            operation,
            'result is not allowed to be read back',
            CrudFailureReason.RESULT_NOT_READABLE
        );

        const injectResult = this.injectForRead(db, model, readArgs);
        if (!injectResult) {
            return { error, result: undefined };
        }

        // inject select needed for field-level read checks
        this.injectReadCheckSelect(model, readArgs);

        if (this.shouldLogQuery) {
            this.logger.info(`[policy] checking read-back, \`findFirst\` ${model}:\n${formatObject(readArgs)}`);
        }
        const result = await db[model].findFirst(readArgs);
        if (!result) {
            return { error, result: undefined };
        }

        this.postProcessForRead(result, model, selectIncludeClean);
        return { result, error: undefined };
    }

    /**
     * Injects field selection needed for checking field-level read policy check and evaluating
     * entity checker into query args.
     */
    injectReadCheckSelect(model: string, args: any) {
        // we need to recurse into relation fields before injecting the current level, because
        // injection into current level can result in relation being selected/included, which
        // can then cause infinite recursion when we visit relation later

        // recurse into relation fields
        const visitTarget = args.select ?? args.include;
        if (visitTarget) {
            for (const key of Object.keys(visitTarget)) {
                const field = resolveField(this.modelMeta, model, key);
                if (field?.isDataModel && visitTarget[key]) {
                    if (typeof visitTarget[key] !== 'object') {
                        // v is "true", ensure it's an object
                        visitTarget[key] = {};
                    }
                    this.injectReadCheckSelect(field.type, visitTarget[key]);
                }
            }
        }

        if (this.hasFieldLevelPolicy(model)) {
            // recursively inject selection for fields needed for field-level read checks
            const readFieldSelect = this.getFieldReadCheckSelector(model);
            if (readFieldSelect) {
                this.doInjectReadCheckSelect(model, args, { select: readFieldSelect });
            }
        }

        const entityChecker = this.getEntityChecker(model, 'read');
        if (entityChecker?.selector) {
            this.doInjectReadCheckSelect(model, args, { select: entityChecker.selector });
        }
    }

    private doInjectReadCheckSelect(model: string, args: any, input: any) {
        // omit should be ignored to avoid interfering with field selection
        if (args.omit) {
            delete args.omit;
        }

        if (!input?.select) {
            return;
        }

        let target: any; // injection target
        let isInclude = false; // if the target is include or select

        if (args.select) {
            target = args.select;
            isInclude = false;
        } else if (args.include) {
            target = args.include;
            isInclude = true;
        } else {
            target = args.select = this.makeAllScalarFieldSelect(model);
            isInclude = false;
        }

        if (!isInclude) {
            // merge selects
            for (const [k, v] of Object.entries(input.select)) {
                if (v === true) {
                    if (!target[k]) {
                        target[k] = true;
                    }
                }
            }
        }

        // recurse into nested selects (relation fields)
        for (const [k, v] of Object.entries<any>(input.select)) {
            if (typeof v === 'object' && v?.select) {
                const field = resolveField(this.modelMeta, model, k);
                if (field?.isDataModel) {
                    // recurse into relation
                    if (isInclude && target[k] === true) {
                        // select all fields for the relation
                        target[k] = { select: this.makeAllScalarFieldSelect(field.type) };
                    } else if (!target[k]) {
                        // ensure an empty select clause
                        target[k] = { select: {} };
                    }
                    // recurse
                    this.doInjectReadCheckSelect(field.type, target[k], v);
                }
            }
        }
    }

    private makeAllScalarFieldSelect(model: string): any {
        const fields = this.getModelFields(model);
        const result: any = {};
        if (fields) {
            Object.entries(fields).forEach(([k, v]) => {
                if (!v.isDataModel) {
                    result[k] = true;
                }
            });
        }
        return result;
    }

    //#endregion

    //#region Errors

    deniedByPolicy(
        model: string,
        operation: PolicyOperationKind,
        extra?: string,
        reason?: CrudFailureReason,
        zodErrors?: ZodError
    ) {
        const args: any = { clientVersion: getVersion(), code: PrismaErrorCode.CONSTRAINED_FAILED, meta: {} };
        if (reason) {
            args.meta.reason = reason;
        }

        if (zodErrors) {
            args.meta.zodErrors = zodErrors;
        }

        return prismaClientKnownRequestError(
            this.db,
            this.prismaModule,
            `denied by policy: ${model} entities failed '${operation}' check${extra ? ', ' + extra : ''}`,
            args
        );
    }

    notFound(model: string) {
        return prismaClientKnownRequestError(this.db, this.prismaModule, `entity not found for model ${model}`, {
            clientVersion: getVersion(),
            code: 'P2025',
        });
    }

    //#endregion

    //#region Misc

    /**
     * Gets field selection for fetching pre-update entity values for the given model.
     */
    getPreValueSelect(model: string) {
        const def = this.getModelPolicyDef(model);
        return def.modelLevel.postUpdate.preUpdateSelector;
    }

    // get a merged selector object for all field-level read policies
    private getFieldReadCheckSelector(model: string) {
        const def = this.getModelPolicyDef(model);
        let result: any = {};
        const fieldLevel = def.fieldLevel?.read;
        if (fieldLevel) {
            for (const def of Object.values(fieldLevel)) {
                if (def.entityChecker?.selector) {
                    result = deepmerge(result, def.entityChecker.selector);
                }
                if (def.overrideEntityChecker?.selector) {
                    result = deepmerge(result, def.overrideEntityChecker.selector);
                }
            }
        }
        return Object.keys(result).length > 0 ? result : undefined;
    }

    private checkReadField(model: string, field: string, entity: any) {
        const def = this.getModelPolicyDef(model);

        // combine regular and override field-level entity checkers with OR
        const checker = def.fieldLevel?.read?.[field]?.entityChecker;
        const overrideChecker = def.fieldLevel?.read?.[field]?.overrideEntityChecker;
        const combinedChecker = this.combineEntityChecker(checker, overrideChecker, 'or');

        if (combinedChecker === undefined) {
            return true;
        } else {
            return combinedChecker.func(entity, { user: this.user });
        }
    }

    private hasFieldValidation(model: string): boolean {
        return this.policy.validation?.[lowerCaseFirst(model)]?.hasValidation === true;
    }

    private hasFieldLevelPolicy(model: string) {
        const def = this.getModelPolicyDef(model);
        return Object.keys(def.fieldLevel?.read ?? {}).length > 0;
    }

    /**
     * Gets Zod schema for the given model and access kind.
     *
     * @param kind kind of Zod schema to get for. If undefined, returns the full schema.
     */
    getZodSchema(
        model: string,
        excludePasswordFields: boolean = true,
        kind: 'create' | 'update' | undefined = undefined
    ) {
        if (!this.hasFieldValidation(model)) {
            return undefined;
        }
        const schemaKey = `${upperCaseFirst(model)}${kind ? 'Prisma' + upperCaseFirst(kind) : ''}Schema`;
        let result = this.zodSchemas?.models?.[schemaKey] as ZodObject<any> | undefined;

        if (result && excludePasswordFields) {
            // fields with `@password` attribute changes at runtime, so we cannot directly use the generated
            // zod schema to validate it, instead, the validation happens when checking the input of "create"
            // and "update" operations
            const modelFields = this.modelMeta.models[lowerCaseFirst(model)]?.fields;
            if (modelFields) {
                for (const [key, field] of Object.entries(modelFields)) {
                    if (field.attributes?.some((attr) => attr.name === '@password')) {
                        // override `@password` field schema with a string schema
                        let pwFieldSchema: ZodSchema = z.string();
                        if (field.isOptional) {
                            pwFieldSchema = pwFieldSchema.nullish();
                        }
                        result = result?.merge(z.object({ [key]: pwFieldSchema }));
                    }
                }
            }
        }

        return result;
    }

    /**
     * Validates the given data against the Zod schema for the given model and kind.
     *
     * @param model model
     * @param kind validation kind. Pass undefined to validate against the full schema.
     * @param data input data
     * @param excludePasswordFields whether exclude schema validation for `@password` fields
     * @param onError error callback
     * @returns Zod-validated data
     */
    validateZodSchema(
        model: string,
        kind: 'create' | 'update' | undefined,
        data: object,
        excludePasswordFields: boolean,
        onError: (error: ZodError) => void
    ) {
        const schema = this.getZodSchema(model, excludePasswordFields, kind);
        if (!schema) {
            return data;
        }

        const parseResult = schema.safeParse(data);
        if (!parseResult.success) {
            if (this.logger.enabled('info')) {
                this.logger.info(
                    `entity ${model} failed validation for operation ${kind}: ${fromZodError(parseResult.error)}`
                );
            }
            onError(parseResult.error);
            return undefined;
        }

        return parseResult.data;
    }

    /**
     * Post processing checks and clean-up for read model entities.
     */
    postProcessForRead(data: any, model: string, queryArgs: any) {
        // preserve the original data as it may be needed for checking field-level readability,
        // while the "data" will be manipulated during traversal (deleting unreadable fields)
        const origData = this.safeClone(data);
        return this.doPostProcessForRead(data, model, origData, queryArgs, this.hasFieldLevelPolicy(model));
    }

    private doPostProcessForRead(
        data: any,
        model: string,
        fullData: any,
        queryArgs: any,
        hasFieldLevelPolicy: boolean,
        path = ''
    ) {
        if (data === null || data === undefined) {
            return data;
        }

        let filteredData = data;
        let filteredFullData = fullData;

        const entityChecker = this.getEntityChecker(model, 'read');
        if (entityChecker) {
            if (Array.isArray(data)) {
                filteredData = [];
                filteredFullData = [];
                for (const [entityData, entityFullData] of zip(data, fullData)) {
                    if (!entityChecker.func(entityData, { user: this.user })) {
                        if (this.shouldLogQuery) {
                            this.logger.info(
                                `[policy] dropping ${model} entity${path ? ' at ' + path : ''} due to entity checker`
                            );
                        }
                    } else {
                        filteredData.push(entityData);
                        filteredFullData.push(entityFullData);
                    }
                }
            } else {
                if (!entityChecker.func(data, { user: this.user })) {
                    if (this.shouldLogQuery) {
                        this.logger.info(
                            `[policy] dropping ${model} entity${path ? ' at ' + path : ''} due to entity checker`
                        );
                    }
                    return null;
                }
            }
        }

        for (const [entityData, entityFullData] of zip(filteredData, filteredFullData)) {
            if (typeof entityData !== 'object' || !entityData) {
                continue;
            }

            for (const [field, fieldData] of Object.entries(entityData)) {
                if (fieldData === undefined) {
                    continue;
                }

                const fieldInfo = resolveField(this.modelMeta, model, field);
                if (!fieldInfo) {
                    // could be _count, etc.
                    continue;
                }

                if (queryArgs?.omit?.[field] === true) {
                    // respect `{ omit: { [field]: true } }`
                    delete entityData[field];
                    continue;
                }

                if (hasFieldLevelPolicy) {
                    // 1. remove fields selected for checking field-level policies but not selected by the original query args
                    // 2. evaluate field-level policies and remove fields that are not readable

                    if (!fieldInfo.isDataModel) {
                        // scalar field, delete unselected ones
                        const select = queryArgs?.select;
                        if (select && typeof select === 'object' && select[field] !== true) {
                            // there's a select clause but this field is not included
                            delete entityData[field];
                            continue;
                        }
                    } else {
                        // relation field, delete if not selected or included
                        const include = queryArgs?.include;
                        const select = queryArgs?.select;
                        if (!include?.[field] && !select?.[field]) {
                            // relation field not included or selected
                            delete entityData[field];
                            continue;
                        }
                    }

                    // delete unreadable fields
                    if (!this.checkReadField(model, field, entityFullData)) {
                        if (this.shouldLogQuery) {
                            this.logger.info(`[policy] dropping unreadable field ${path ? path + '.' : ''}${field}`);
                        }
                        delete entityData[field];
                        continue;
                    }
                }

                if (fieldInfo.isDataModel) {
                    // recurse into nested fields
                    const nextArgs = (queryArgs?.select ?? queryArgs?.include)?.[field];
                    const nestedResult = this.doPostProcessForRead(
                        fieldData,
                        fieldInfo.type,
                        entityFullData[field],
                        nextArgs,
                        this.hasFieldLevelPolicy(fieldInfo.type),
                        path ? path + '.' + field : field
                    );
                    if (nestedResult === undefined) {
                        delete entityData[field];
                    } else {
                        entityData[field] = nestedResult;
                    }
                }
            }
        }

        return filteredData;
    }

    /**
     * Replace content of `target` object with `withObject` in-place.
     */
    replace(target: any, withObject: any) {
        if (!target || typeof target !== 'object' || !withObject || typeof withObject !== 'object') {
            return;
        }

        // remove missing keys
        for (const key of Object.keys(target)) {
            if (!(key in withObject)) {
                delete target[key];
            }
        }

        // overwrite keys
        for (const [key, value] of Object.entries(withObject)) {
            target[key] = value;
        }
    }

    /**
     * Picks properties from an object.
     */
    pick<T>(value: T, ...props: (keyof T)[]): Pick<T, (typeof props)[number]> {
        const v: any = value;
        return props.reduce(function (result, prop) {
            if (prop in v) {
                result[prop] = v[prop];
            }
            return result;
        }, {} as any);
    }

    private mergeWhereClause(where: any, extra: any) {
        if (!where) {
            throw new Error('invalid where clause');
        }

        if (this.isTrue(extra)) {
            return;
        }

        // instead of simply wrapping with AND, we preserve the structure
        // of the original where clause and merge `extra` into it so that
        // unique query can continue working
        if (where.AND) {
            // merge into existing AND clause
            const conditions = Array.isArray(where.AND) ? [...where.AND] : [where.AND];
            conditions.push(extra);
            const combined: any = this.and(...conditions);

            // make sure the merging always goes under AND
            where.AND = combined.AND ?? combined;
        } else {
            // insert an AND clause
            where.AND = [extra];
        }
    }

    /**
     * Given an entity data, returns an object only containing id fields.
     */
    getIdFieldValues(model: string, data: any) {
        if (!data) {
            return undefined;
        }
        const idFields = this.getIdFields(model);
        return Object.fromEntries(idFields.map((f) => [f.name, data[f.name]]));
    }

    //#endregion
}
