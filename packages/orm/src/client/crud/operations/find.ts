import type { SchemaDef } from '../../../schema';
import { BaseOperationHandler, type CoreCrudOperations } from './base';

export class FindOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(operation: CoreCrudOperations, args: unknown, validateArgs = true): Promise<unknown> {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);

        const findOne = operation === 'findFirst' || operation === 'findUnique';

        // parse args
        let parsedArgs = validateArgs
            ? this.inputValidator.validateFindArgs(
                  this.model,
                  normalizedArgs,
                  operation as 'findFirst' | 'findUnique' | 'findMany',
              )
            : (normalizedArgs as any);

        if (findOne) {
            // ensure "limit 1"
            parsedArgs = parsedArgs ?? {};
            parsedArgs.take = 1;
        }

        // run query
        const result = await this.read(this.client.$qb, this.model, parsedArgs);

        const finalResult = findOne ? (result[0] ?? null) : result;
        return finalResult;
    }
}
