/* eslint-disable @typescript-eslint/no-explicit-any */

import deepcopy from 'deepcopy';
import { lowerCaseFirst } from 'lower-case-first';
import { upperCaseFirst } from 'upper-case-first';
import { ZodError } from 'zod';
import { fromZodError } from 'zod-validation-error';
import {
    CrudFailureReason,
    FIELD_LEVEL_READ_CHECKER_PREFIX,
    FIELD_LEVEL_READ_CHECKER_SELECTOR,
    FIELD_LEVEL_UPDATE_GUARD_PREFIX,
    HAS_FIELD_LEVEL_POLICY_FLAG,
    PRE_UPDATE_VALUE_SELECTOR,
    PrismaErrorCode,
} from '../../constants';
import {
    enumerate,
    getFields,
    getModelFields,
    resolveField,
    zip,
    type FieldInfo,
    type ModelMeta,
    type NestedWriteVisitorContext,
} from '../../cross';
import { AuthUser, DbClientContract, DbOperations, PolicyOperationKind } from '../../types';
import { getVersion } from '../../version';
import type { InputCheckFunc, PolicyDef, ReadFieldCheckFunc, ZodSchemas } from '../types';
import {
    formatObject,
    getIdFields,
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
                    result[key] = this.reduce(value);
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

    //# Auth guard

    /**
     * Gets pregenerated authorization guard object for a given model and operation.
     *
     * @returns true if operation is unconditionally allowed, false if unconditionally denied,
     * otherwise returns a guard object
     */
    getAuthGuard(
        db: Record<string, DbOperations>,
        model: string,
        operation: PolicyOperationKind,
        preValue?: any
    ): object {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }

        const provider = guard[operation];
        if (typeof provider === 'boolean') {
            return this.reduce(provider);
        }

        if (!provider) {
            throw this.unknownError(`zenstack: unable to load authorization guard for ${model}`);
        }
        const r = provider({ user: this.user, preValue }, db);
        return this.reduce(r);
    }

    /**
     * Get field-level auth guard
     */
    getFieldUpdateAuthGuard(db: Record<string, DbOperations>, model: string, field: string): object {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }

        const provider = guard[`${FIELD_LEVEL_UPDATE_GUARD_PREFIX}${field}`];
        if (typeof provider === 'boolean') {
            return this.reduce(provider);
        }

        if (!provider) {
            return this.makeTrue();
        }
        const r = provider({ user: this.user }, db);
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
        const provider = guard[operation];
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
    injectAuthGuard(db: Record<string, DbOperations>, args: any, model: string, operation: PolicyOperationKind) {
        let guard = this.getAuthGuard(db, model, operation);
        if (this.isFalse(guard)) {
            args.where = this.makeFalse();
            return false;
        }

        if (operation === 'update' && args) {
            // merge field-level policy guards
            const fieldUpdateGuard = this.getFieldUpdateGuards(db, model, args);
            if (fieldUpdateGuard.rejectedByField) {
                // rejected
                args.where = this.makeFalse();
                return false;
            } else if (fieldUpdateGuard.guard) {
                // merge
                guard = this.and(guard, fieldUpdateGuard.guard);
            }
        }

        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            this.injectGuardForRelationFields(db, model, args.where, operation);
        }

        args.where = this.and(args.where, guard);
        return true;
    }

    private injectGuardForRelationFields(
        db: Record<string, DbOperations>,
        model: string,
        payload: any,
        operation: PolicyOperationKind
    ) {
        for (const [field, subPayload] of Object.entries<any>(payload)) {
            if (!subPayload) {
                continue;
            }

            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel) {
                continue;
            }

            if (fieldInfo.isArray) {
                this.injectGuardForToManyField(db, fieldInfo, subPayload, operation);
            } else {
                this.injectGuardForToOneField(db, fieldInfo, subPayload, operation);
            }
        }
    }

    private injectGuardForToManyField(
        db: Record<string, DbOperations>,
        fieldInfo: FieldInfo,
        payload: { some?: any; every?: any; none?: any },
        operation: PolicyOperationKind
    ) {
        const guard = this.getAuthGuard(db, fieldInfo.type, operation);
        if (payload.some) {
            this.injectGuardForRelationFields(db, fieldInfo.type, payload.some, operation);
            // turn "some" into: { some: { AND: [guard, payload.some] } }
            payload.some = this.and(payload.some, guard);
        }
        if (payload.none) {
            this.injectGuardForRelationFields(db, fieldInfo.type, payload.none, operation);
            // turn none into: { none: { AND: [guard, payload.none] } }
            payload.none = this.and(payload.none, guard);
        }
        if (
            payload.every &&
            typeof payload.every === 'object' &&
            // ignore empty every clause
            Object.keys(payload.every).length > 0
        ) {
            this.injectGuardForRelationFields(db, fieldInfo.type, payload.every, operation);

            // turn "every" into: { none: { AND: [guard, { NOT: payload.every }] } }
            if (!payload.none) {
                payload.none = {};
            }
            payload.none = this.and(payload.none, guard, this.not(payload.every));
            delete payload.every;
        }
    }

    private injectGuardForToOneField(
        db: Record<string, DbOperations>,
        fieldInfo: FieldInfo,
        payload: { is?: any; isNot?: any } & Record<string, any>,
        operation: PolicyOperationKind
    ) {
        const guard = this.getAuthGuard(db, fieldInfo.type, operation);

        // is|isNot and flat fields conditions are mutually exclusive

        if (payload.is || payload.isNot) {
            if (payload.is) {
                this.injectGuardForRelationFields(db, fieldInfo.type, payload.is, operation);
            }
            if (payload.isNot) {
                this.injectGuardForRelationFields(db, fieldInfo.type, payload.isNot, operation);
            }
            // merge guard with existing "is": { is: [originalIs, guard] }
            payload.is = this.and(payload.is, guard);
        } else {
            this.injectGuardForRelationFields(db, fieldInfo.type, payload, operation);
            // turn direct conditions into: { is: { AND: [ originalConditions, guard ] } }
            const combined = this.and(deepcopy(payload), guard);
            Object.keys(payload).forEach((key) => delete payload[key]);
            payload.is = combined;
        }
    }

    /**
     * Injects auth guard for read operations.
     */
    injectForRead(db: Record<string, DbOperations>, model: string, args: any) {
        const injected: any = {};
        if (!this.injectAuthGuard(db, injected, model, 'read')) {
            return false;
        }

        if (args.where) {
            // inject into relation fields:
            //   to-many: some/none/every
            //   to-one: direct-conditions/is/isNot
            this.injectGuardForRelationFields(db, model, args.where, 'read');
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
                    if (value) {
                        for (const [f, v] of Object.entries(value)) {
                            args[f] = v;
                        }
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
    buildReversedQuery(context: NestedWriteVisitorContext, mutating = false, unsafeOperation = false) {
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
                if (!backLinkField) {
                    throw this.unknownError(`missing backLink field ${currField.backLink} in ${currField.type}`);
                }

                if (backLinkField.isArray && !mutating) {
                    // many-side of relationship, wrap with "some" query
                    currQuery[currField.backLink] = { some: { ...visitWhere } };
                } else {
                    const fkMapping = where && backLinkField.isRelationOwner && backLinkField.foreignKeyMapping;

                    // calculate if we should preserve the relation condition (e.g., { user: { id: 1 } })
                    const shouldPreserveRelationCondition =
                        // doing a mutation
                        mutating &&
                        // and it's a safe mutate
                        !unsafeOperation &&
                        // and the current segment is the direct parent (the last one is the mutate itself),
                        // the relation condition should be preserved and will be converted to a "connect" later
                        i === context.nestingPath.length - 2;

                    if (fkMapping && !shouldPreserveRelationCondition) {
                        // turn relation condition into foreign key condition, e.g.:
                        //     { user: { id: 1 } } => { userId: 1 }
                        for (const [r, fk] of Object.entries<string>(fkMapping)) {
                            currQuery[fk] = visitWhere[r];
                        }

                        if (i > 0) {
                            // prepare for the next segment
                            currQuery[currField.backLink] = {};
                        }
                    } else {
                        // preserve the original structure
                        currQuery[currField.backLink] = { ...visitWhere };
                    }
                }
                currQuery = currQuery[currField.backLink];
                currField = field;
            }
        }
        return result;
    }

    private injectNestedReadConditions(db: Record<string, DbOperations>, model: string, args: any): any[] {
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
                this.injectAuthGuard(db, injectTarget._count.select[field], fieldInfo.type, 'read');
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
                this.injectAuthGuard(db, injectTarget[field], fieldInfo.type, 'read');

                // recurse
                const subHoisted = this.injectNestedReadConditions(db, fieldInfo.type, injectTarget[field]);
                if (subHoisted.length > 0) {
                    // we can convert it to a where at this level
                    injectTarget[field].where = this.and(injectTarget[field].where, ...subHoisted);
                }
            } else {
                // hoist non-nullable to-one filter to the parent level
                hoisted = this.getAuthGuard(db, fieldInfo.type, 'read');
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
        db: Record<string, DbOperations>,
        args: any,
        preValue?: any
    ) {
        let guard = this.getAuthGuard(db, model, operation, preValue);
        if (this.isFalse(guard)) {
            throw this.deniedByPolicy(
                model,
                operation,
                `entity ${formatObject(uniqueFilter)} failed policy check`,
                CrudFailureReason.ACCESS_POLICY_VIOLATION
            );
        }

        if (operation === 'update' && args) {
            // merge field-level policy guards
            const fieldUpdateGuard = this.getFieldUpdateGuards(db, model, args);
            if (fieldUpdateGuard.rejectedByField) {
                // rejected
                throw this.deniedByPolicy(
                    model,
                    'update',
                    `entity ${formatObject(uniqueFilter)} failed update policy check for field "${
                        fieldUpdateGuard.rejectedByField
                    }"`,
                    CrudFailureReason.ACCESS_POLICY_VIOLATION
                );
            } else if (fieldUpdateGuard.guard) {
                // merge
                guard = this.and(guard, fieldUpdateGuard.guard);
            }
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
            throw this.deniedByPolicy(
                model,
                operation,
                `entity ${formatObject(uniqueFilter)} failed policy check`,
                CrudFailureReason.ACCESS_POLICY_VIOLATION
            );
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
                    CrudFailureReason.DATA_VALIDATION_VIOLATION,
                    parseResult.error
                );
            }
        }
    }

    private getFieldUpdateGuards(db: Record<string, DbOperations>, model: string, args: any) {
        const allFieldGuards = [];
        for (const [k, v] of Object.entries<any>(args.data ?? args)) {
            if (typeof v === 'undefined') {
                continue;
            }
            const fieldGuard = this.getFieldUpdateAuthGuard(db, model, k);
            if (this.isFalse(fieldGuard)) {
                return { guard: allFieldGuards, rejectedByField: k };
            }
            allFieldGuards.push(fieldGuard);
        }
        return { guard: this.and(...allFieldGuards), rejectedByField: undefined };
    }

    /**
     * Tries rejecting a request based on static "false" policy.
     */
    tryReject(db: Record<string, DbOperations>, model: string, operation: PolicyOperationKind) {
        const guard = this.getAuthGuard(db, model, operation);
        if (this.isFalse(guard)) {
            throw this.deniedByPolicy(model, operation, undefined, CrudFailureReason.ACCESS_POLICY_VIOLATION);
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

        this.postProcessForRead(result, model, selectInclude);
        return { result, error: undefined };
    }

    /**
     * Injects field selection needed for checking field-level read policy into query args.
     * @returns
     */
    injectReadCheckSelect(model: string, args: any) {
        if (!this.hasFieldLevelPolicy(model)) {
            return;
        }

        const readFieldSelect = this.getReadFieldSelect(model);
        if (!readFieldSelect) {
            return;
        }

        this.doInjectReadCheckSelect(model, args, { select: readFieldSelect });
    }

    private doInjectReadCheckSelect(model: string, args: any, input: any) {
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
        const fields = this.modelMeta.fields[lowerCaseFirst(model)];
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
            `denied by policy: ${model} entities failed '${operation}' check${extra ? ', ' + extra : ''}`,
            args
        );
    }

    notFound(model: string) {
        return prismaClientKnownRequestError(this.db, `entity not found for model ${model}`, {
            clientVersion: getVersion(),
            code: 'P2025',
        });
    }

    validationError(message: string) {
        return prismaClientValidationError(this.db, message);
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
        return guard[PRE_UPDATE_VALUE_SELECTOR];
    }

    private getReadFieldSelect(model: string): object | undefined {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        return guard[FIELD_LEVEL_READ_CHECKER_SELECTOR];
    }

    private checkReadField(model: string, field: string, entity: any) {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        const func = guard[`${FIELD_LEVEL_READ_CHECKER_PREFIX}${field}`] as ReadFieldCheckFunc | undefined;
        if (!func) {
            return true;
        } else {
            return func(entity, { user: this.user });
        }
    }

    private hasFieldValidation(model: string): boolean {
        return this.policy.validation?.[lowerCaseFirst(model)]?.hasValidation === true;
    }

    private hasFieldLevelPolicy(model: string) {
        const guard = this.policy.guard[lowerCaseFirst(model)];
        if (!guard) {
            throw this.unknownError(`unable to load policy guard for ${model}`);
        }
        return !!guard[HAS_FIELD_LEVEL_POLICY_FLAG];
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
    postProcessForRead(data: any, model: string, queryArgs: any) {
        // preserve the original data as it may be needed for checking field-level readability,
        // while the "data" will be manipulated during traversal (deleting unreadable fields)
        const origData = this.clone(data);
        this.doPostProcessForRead(data, model, origData, queryArgs, this.hasFieldLevelPolicy(model));
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
            return;
        }

        for (const [entityData, entityFullData] of zip(data, fullData)) {
            if (typeof entityData !== 'object' || !entityData) {
                return;
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
                    this.doPostProcessForRead(
                        fieldData,
                        fieldInfo.type,
                        entityFullData[field],
                        nextArgs,
                        this.hasFieldLevelPolicy(fieldInfo.type),
                        path ? path + '.' + field : field
                    );
                }
            }
        }
    }

    /**
     * Gets information for all fields of a model.
     */
    getModelFields(model: string) {
        model = lowerCaseFirst(model);
        return this.modelMeta.fields[model];
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

    //#endregion
}
