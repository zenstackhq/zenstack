import type { SchemaDef } from '@zenstackhq/schema';
import { BaseOperationHandler } from './base';

export class CountOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(_operation: 'count', args: unknown | undefined) {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);

        // parse args
        const parsedArgs = this.inputValidator.validateCountArgs(this.model, normalizedArgs);
        const subQueryName = '$sub';

        let query = this.kysely.selectFrom((eb) => {
            // nested query for filtering and pagination

            let subQuery = this.dialect
                .buildSelectModel(this.model, this.model)
                .where(() => this.dialect.buildFilter(this.model, this.model, parsedArgs?.where));

            if (parsedArgs?.select && typeof parsedArgs.select === 'object') {
                // select fields
                for (const [key, value] of Object.entries(parsedArgs.select)) {
                    if (key !== '_all' && value === true) {
                        subQuery = this.dialect.buildSelectField(subQuery, this.model, this.model, key);
                    }
                }
            } else {
                // no field selection, just build a `select 1`
                subQuery = subQuery.select(() => eb.lit(1).as('_all'));
            }

            subQuery = this.dialect.buildSkipTake(subQuery, parsedArgs?.skip, parsedArgs?.take);
            return subQuery.as(subQueryName);
        });

        if (parsedArgs?.select && typeof parsedArgs.select === 'object') {
            // count with field selection
            query = query.select((eb) =>
                Object.keys(parsedArgs.select!).map((key) =>
                    key === '_all'
                        ? this.dialect.castInt(eb.fn.countAll()).as('_all')
                        : this.dialect.castInt(eb.fn.count(eb.ref(`${subQueryName}.${key}`))).as(key),
                ),
            );
            const result = await this.executeQuery(this.kysely, query, 'count');
            return result.rows[0];
        } else {
            // simple count all
            query = query.select((eb) => this.dialect.castInt(eb.fn.countAll()).as('count'));
            const result = await this.executeQuery(this.kysely, query, 'count');
            return (result.rows[0] as any).count as number;
        }
    }
}
