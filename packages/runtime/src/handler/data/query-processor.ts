import deepcopy from 'deepcopy';
import { PolicyOperationKind, QueryContext, Service } from '../../types';

export class QueryProcessor {
    constructor(private readonly service: Service) {}

    async processQueryArgs(
        model: string,
        args: any,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {
        const r = args ? deepcopy(args) : {};
        const guard = this.service.buildQueryGuard(model, operation, context);
        if (guard) {
            if (!r.where) {
                r.where = guard;
            } else {
                r.where = {
                    AND: [guard, r.where],
                };
            }
        }

        if (r.include || r.select) {
            // "include" and "select" are mutually exclusive
            const selector = r.include ? 'include' : 'select';
            for (const [field, value] of Object.entries(r[selector])) {
                const fieldInfo = await this.service.resolveField(model, field);
                if (fieldInfo && fieldInfo.isArray) {
                    // note that Prisma only allows to attach filter for "to-many" relation
                    // query, so we need to handle "to-one" filter separately in post-processing
                    const fieldGuard = await this.processQueryArgs(
                        fieldInfo.type,
                        value === true ? {} : value,
                        operation,
                        context
                    );
                    r[selector][field] = fieldGuard;
                }
            }
        }

        return r;
    }

    async postProcess(
        model: string,
        queryArgs: any,
        data: any,
        operation: PolicyOperationKind,
        context: QueryContext
    ) {}
}
