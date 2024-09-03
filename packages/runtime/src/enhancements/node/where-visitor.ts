/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { enumerate, resolveField, type FieldInfo, type ModelMeta } from '../../cross';

/**
 * Context for visiting
 */
export type WhereVisitorContext = {
    /**
     * Parent data, can be used to replace fields
     */
    parent: any;

    /**
     * Current field, undefined if toplevel
     */
    field?: FieldInfo;
};

/**
 * WhereVisitor's callback actions
 */
export type WhereVisitorCallback = {
    field?: (field: FieldInfo, data: any) => Promise<unknown>;
};

const FILTER_OPERATORS = [
    'equals',
    'not',
    'in',
    'notIn',
    'lt',
    'lte',
    'gt',
    'gte',
    'contains',
    'search',
    'startsWith',
    'endsWith',
];

const RELATION_FILTER_OPERATORS = ['is', 'isNot', 'some', 'every', 'none'];

/**
 * Recursive visitor for where payload
 */
export class WhereVisitor {
    constructor(private readonly modelMeta: ModelMeta, private readonly callback: WhereVisitorCallback) {}

    /**
     * Start visiting
     */
    async visit(model: string, where: any): Promise<void> {
        if (!where) {
            return;
        }

        for (const [k, v] of Object.entries<any>(where)) {
            if (['AND', 'OR', 'NOT'].includes(k)) {
                for (const item of enumerate(v)) {
                    await this.visit(model, item);
                }
                continue;
            }

            if (RELATION_FILTER_OPERATORS.includes(k)) {
                // visit into filter body
                await this.visit(model, v);
                continue;
            }

            const field = resolveField(this.modelMeta, model, k);
            if (!field) {
                continue;
            }

            if (typeof v === 'object') {
                const filterOp = Object.keys(v).find((f) => FILTER_OPERATORS.includes(f));
                if (filterOp) {
                    // reach into filter value
                    const newValue = await this.callback.field?.(field, v[filterOp]);
                    v[filterOp] = newValue;
                    continue;
                }

                if (Object.keys(v).some((f) => RELATION_FILTER_OPERATORS.includes(f))) {
                    // filter payload
                    await this.visit(field.type, v);
                    continue;
                }
            }

            // scalar field
            const newValue = await this.callback.field?.(field, v);
            where[k] = newValue;
        }
    }
}
