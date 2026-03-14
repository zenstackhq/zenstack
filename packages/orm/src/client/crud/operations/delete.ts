import { match } from 'ts-pattern';
import type { SchemaDef } from '../../../schema';
import { createNotFoundError, createRejectedByPolicyError, RejectedByPolicyReason } from '../../errors';
import { BaseOperationHandler } from './base';

export class DeleteOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(operation: 'delete' | 'deleteMany', args: unknown | undefined) {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);

        return match(operation)
            .with('delete', () => this.runDelete(this.inputValidator.validateDeleteArgs(this.model, normalizedArgs)))
            .with('deleteMany', () =>
                this.runDeleteMany(this.inputValidator.validateDeleteManyArgs(this.model, normalizedArgs)),
            )
            .exhaustive();
    }

    async runDelete(args: any) {
        // analyze if we need to read back the deleted record, or just return delete result
        const { needReadBack, selectedFields } = this.mutationNeedsReadBack(this.model, args);

        // analyze if the delete involves nested deletes
        const needsNestedDelete = this.needsNestedDelete();

        const result = await this.safeTransactionIf(needReadBack || needsNestedDelete, async (tx) => {
            let preDeleteRead: any = undefined;
            if (needReadBack) {
                preDeleteRead = await this.readUnique(tx, this.model, {
                    select: args.select,
                    include: args.include,
                    omit: args.omit,
                    where: args.where,
                });
            }
            const deleteResult = await this.delete(tx, this.model, args.where, undefined, undefined, selectedFields);
            if (!deleteResult.numAffectedRows) {
                throw createNotFoundError(this.model);
            }

            return needReadBack ? preDeleteRead : deleteResult.rows[0];
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

    async runDeleteMany(args?: any) {
        // analyze if the delete involves nested deletes
        const needsNestedDelete = this.needsNestedDelete();

        return await this.safeTransactionIf(needsNestedDelete, async (tx) => {
            const result = await this.delete(tx, this.model, args?.where, args?.limit);
            return { count: Number(result.numAffectedRows ?? 0) };
        });
    }

    private needsNestedDelete() {
        const modelDef = this.requireModel(this.model);
        return !!modelDef.baseModel;
    }
}
