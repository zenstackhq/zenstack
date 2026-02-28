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

        // TODO: avoid using transaction for simple delete
        const result = await this.safeTransaction(async (tx) => {
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
        return await this.safeTransaction(async (tx) => {
            const result = await this.delete(tx, this.model, args?.where, args?.limit);
            return { count: Number(result.numAffectedRows ?? 0) };
        });
    }
}
