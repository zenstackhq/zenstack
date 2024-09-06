import { match, P } from 'ts-pattern';
import { ModelMeta, requireField } from '..';
import type { DbClientContract } from '../../../types';
import { createDeferredPromise } from '../promise';
import { PermissionCheckArgs, PermissionCheckerConstraint } from '../types';
import { prismaClientValidationError } from '../utils';
import { ConstraintSolver } from './constraint-solver';
import { PolicyUtil } from './policy-utils';

export async function checkPermission(
    model: string,
    args: PermissionCheckArgs,
    modelMeta: ModelMeta,
    policyUtils: PolicyUtil,
    prisma: DbClientContract,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaModule: any
) {
    return createDeferredPromise(() => doCheckPermission(model, args, modelMeta, policyUtils, prisma, prismaModule));
}

async function doCheckPermission(
    model: string,
    args: PermissionCheckArgs,
    modelMeta: ModelMeta,
    policyUtils: PolicyUtil,
    prisma: DbClientContract,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prismaModule: any
) {
    if (!['create', 'read', 'update', 'delete'].includes(args.operation)) {
        throw prismaClientValidationError(prisma, prismaModule, `Invalid "operation" ${args.operation}`);
    }

    let constraint = policyUtils.getCheckerConstraint(model, args.operation);
    if (typeof constraint === 'boolean') {
        return constraint;
    }

    if (args.where) {
        // combine runtime filters with generated constraints

        const extraConstraints: PermissionCheckerConstraint[] = [];
        for (const [field, value] of Object.entries(args.where)) {
            if (value === undefined) {
                continue;
            }

            if (value === null) {
                throw prismaClientValidationError(
                    prisma,
                    prismaModule,
                    `Using "null" as filter value is not supported yet`
                );
            }

            const fieldInfo = requireField(modelMeta, model, field);

            // relation and array fields are not supported
            if (fieldInfo.isDataModel || fieldInfo.isArray) {
                throw prismaClientValidationError(
                    prisma,
                    prismaModule,
                    `Providing filter for field "${field}" is not supported. Only scalar fields are allowed.`
                );
            }

            // map field type to constraint type
            const fieldType = match<string, 'number' | 'string' | 'boolean'>(fieldInfo.type)
                .with(P.union('Int', 'BigInt', 'Float', 'Decimal'), () => 'number')
                .with('String', () => 'string')
                .with('Boolean', () => 'boolean')
                .otherwise(() => {
                    throw prismaClientValidationError(
                        prisma,
                        prismaModule,
                        `Providing filter for field "${field}" is not supported. Only number, string, and boolean fields are allowed.`
                    );
                });

            // check value type
            const valueType = typeof value;
            if (valueType !== 'number' && valueType !== 'string' && valueType !== 'boolean') {
                throw prismaClientValidationError(
                    prisma,
                    prismaModule,
                    `Invalid value type for field "${field}". Only number, string or boolean is allowed.`
                );
            }

            if (fieldType !== valueType) {
                throw prismaClientValidationError(
                    prisma,
                    prismaModule,
                    `Invalid value type for field "${field}". Expected "${fieldType}".`
                );
            }

            // check number validity
            if (typeof value === 'number' && (!Number.isInteger(value) || value < 0)) {
                throw prismaClientValidationError(
                    prisma,
                    prismaModule,
                    `Invalid value for field "${field}". Only non-negative integers are allowed.`
                );
            }

            // build a constraint
            extraConstraints.push({
                kind: 'eq',
                left: { kind: 'variable', name: field, type: fieldType },
                right: { kind: 'value', value, type: fieldType },
            });
        }

        if (extraConstraints.length > 0) {
            // combine the constraints
            constraint = { kind: 'and', children: [constraint, ...extraConstraints] };
        }
    }

    // check satisfiability
    return new ConstraintSolver().checkSat(constraint);
}
