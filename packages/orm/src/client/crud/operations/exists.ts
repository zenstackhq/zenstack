import type { SchemaDef } from '@zenstackhq/schema';
import { BaseOperationHandler } from './base';

export class ExistsOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(_operation: 'exists', args: unknown): Promise<unknown> {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);
        const parsedArgs = this.inputValidator.validateExistsArgs(this.model, normalizedArgs);

        return await this.existsNonUnique(this.client.$qb, this.model, parsedArgs?.where);
    }
}
