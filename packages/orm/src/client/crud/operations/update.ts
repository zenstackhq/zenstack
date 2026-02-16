import { match } from 'ts-pattern';
import type { GetModels, SchemaDef } from '../../../schema';
import type { WhereInput } from '../../crud-types';
import { createRejectedByPolicyError, RejectedByPolicyReason } from '../../errors';
import { getIdValues } from '../../query-utils';
import { BaseOperationHandler } from './base';

export class UpdateOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(operation: 'update' | 'updateMany' | 'updateManyAndReturn' | 'upsert', args: unknown) {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);

        return match(operation)
            .with('update', () => this.runUpdate(this.inputValidator.validateUpdateArgs(this.model, normalizedArgs)))
            .with('updateMany', () =>
                this.runUpdateMany(this.inputValidator.validateUpdateManyArgs(this.model, normalizedArgs)),
            )
            .with('updateManyAndReturn', () =>
                this.runUpdateManyAndReturn(
                    this.inputValidator.validateUpdateManyAndReturnArgs(this.model, normalizedArgs),
                ),
            )
            .with('upsert', () => this.runUpsert(this.inputValidator.validateUpsertArgs(this.model, normalizedArgs)))
            .exhaustive();
    }

    private async runUpdate(args: any) {
        // analyze if we need to read back the update record, or just return the updated result
        const { needReadBack, selectedFields } = this.needReadBack(args);

        const result = await this.safeTransaction(async (tx) => {
            const updateResult = await this.update(
                tx,
                this.model,
                args.where,
                args.data,
                undefined,
                undefined,
                undefined,
                selectedFields,
            );

            if (needReadBack) {
                // updated can be undefined if there's nothing to update, in that case we'll use the original
                // filter to read back the entity
                // note that we trim filter to id fields only, just in case underlying executor returns more fields
                const readFilter = updateResult ? getIdValues(this.schema, this.model, updateResult) : args.where;
                let readBackResult: any = undefined;
                readBackResult = await this.readUnique(tx, this.model, {
                    select: args.select,
                    include: args.include,
                    omit: args.omit,
                    where: readFilter,
                });
                return readBackResult;
            } else {
                return updateResult;
            }
        });

        if (!result) {
            // update succeeded but result cannot be read back
            if (this.hasPolicyEnabled) {
                // if access policy is enabled, we assume it's due to read violation (not guaranteed though)
                throw createRejectedByPolicyError(
                    this.model,
                    RejectedByPolicyReason.CANNOT_READ_BACK,
                    'result is not allowed to be read back',
                );
            } else {
                // this can happen if the entity is cascade deleted during the update, return null to
                // be consistent with Prisma even though it doesn't comply with the method signature
                return null;
            }
        } else {
            return result;
        }
    }

    private async runUpdateMany(args: any) {
        // TODO: avoid using transaction for simple update
        return this.safeTransaction(async (tx) => {
            return this.updateMany(tx, this.model, args.where, args.data, args.limit, false);
        });
    }

    private async runUpdateManyAndReturn(args: any) {
        if (!args) {
            return [];
        }

        // analyze if we need to read back the updated record, or just return the update result
        const { needReadBack, selectedFields } = this.needReadBack(args);

        const { readBackResult, updateResult } = await this.safeTransaction(async (tx) => {
            const updateResult = await this.updateMany(
                tx,
                this.model,
                args.where,
                args.data,
                args.limit,
                true,
                undefined,
                undefined,
                selectedFields,
            );

            if (needReadBack) {
                const readBackResult = await this.read(
                    tx,
                    this.model,
                    {
                        select: args.select,
                        omit: args.omit,
                        where: {
                            OR: updateResult.map((item) => getIdValues(this.schema, this.model, item) as any),
                        },
                    } as any, // TODO: fix type
                );

                return { readBackResult, updateResult };
            } else {
                return { readBackResult: updateResult, updateResult };
            }
        });

        if (readBackResult.length < updateResult.length && this.hasPolicyEnabled) {
            // some of the updated entities cannot be read back
            throw createRejectedByPolicyError(
                this.model,
                RejectedByPolicyReason.CANNOT_READ_BACK,
                'result is not allowed to be read back',
            );
        }

        return readBackResult;
    }

    private async runUpsert(args: any) {
        // analyze if we need to read back the updated record, or just return the update result
        const { needReadBack, selectedFields } = this.needReadBack(args);

        const result = await this.safeTransaction(async (tx) => {
            let mutationResult: unknown = await this.update(
                tx,
                this.model,
                args.where,
                args.update,
                undefined,
                true,
                false,
                selectedFields,
            );

            if (!mutationResult) {
                // non-existing, create
                mutationResult = await this.create(tx, this.model, args.create, undefined, undefined, selectedFields);
            }

            if (needReadBack) {
                return this.readUnique(tx, this.model, {
                    select: args.select,
                    include: args.include,
                    omit: args.omit,
                    where: getIdValues(this.schema, this.model, mutationResult) as WhereInput<
                        Schema,
                        GetModels<Schema>,
                        any,
                        false
                    >,
                });
            } else {
                return mutationResult;
            }
        });

        if (!result && this.hasPolicyEnabled) {
            throw createRejectedByPolicyError(
                this.model,
                RejectedByPolicyReason.CANNOT_READ_BACK,
                'result is not allowed to be read back',
            );
        }

        return result;
    }

    private needReadBack(args: any) {
        const baseResult = this.mutationNeedsReadBack(this.model, args);
        if (baseResult.needReadBack) {
            return baseResult;
        }

        if (!this.dialect.supportsReturning) {
            // if dialect doesn't support "returning", we always need to read back
            return { needReadBack: true, selectedFields: undefined };
        }

        // further check if we're not updating any non-relation fields, because if so,
        // SQL "returning" is not effective, we need to always read back

        const modelDef = this.requireModel(this.model);
        const nonRelationFields = Object.entries(modelDef.fields)
            .filter(([_, def]) => !def.relation)
            .map(([name, _]) => name);

        // update/updateMany payload
        if (args.data && !Object.keys(args.data).some((field) => nonRelationFields.includes(field))) {
            return { needReadBack: true, selectedFields: undefined };
        }

        // upsert payload
        if (args.update && !Object.keys(args.update).some((field: string) => nonRelationFields.includes(field))) {
            return { needReadBack: true, selectedFields: undefined };
        }

        return baseResult;
    }
}
