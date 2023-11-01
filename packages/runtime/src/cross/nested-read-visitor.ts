/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveField, type FieldInfo, type ModelMeta } from './model-meta';

export type NestedReadVisitorCallback = {
    field?: (
        model: string,
        field: FieldInfo | undefined,
        kind: 'include' | 'select' | undefined,
        args: unknown
    ) => void | boolean;
};

/**
 * Visitor for nested read payload.
 */
export class NestedReadVisitor {
    constructor(private readonly modelMeta: ModelMeta, private readonly callback: NestedReadVisitorCallback) {}

    doVisit(model: string, field: FieldInfo | undefined, kind: 'include' | 'select' | undefined, args: unknown) {
        if (this.callback.field) {
            const r = this.callback.field(model, field, kind, args);
            if (r === false) {
                return;
            }
        }

        if (!args || typeof args !== 'object') {
            return;
        }

        let selectInclude: any;
        let nextKind: 'select' | 'include' | undefined;
        if ((args as any).select) {
            selectInclude = (args as any).select;
            nextKind = 'select';
        } else if ((args as any).include) {
            selectInclude = (args as any).include;
            nextKind = 'include';
        }

        if (selectInclude && typeof selectInclude === 'object') {
            for (const [k, v] of Object.entries(selectInclude)) {
                if (k === '_count' && typeof v === 'object' && v) {
                    // recurse into { _count: { ... } }
                    this.doVisit(model, field, kind, v);
                } else {
                    const field = resolveField(this.modelMeta, model, k);
                    if (field) {
                        this.doVisit(field.type, field, nextKind, v);
                    }
                }
            }
        }
    }

    visit(model: string, args: unknown) {
        this.doVisit(model, undefined, undefined, args);
    }
}
