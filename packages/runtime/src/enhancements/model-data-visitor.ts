/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveField } from './model-meta';
import { ModelMeta } from './types';

/**
 * Callback for @see ModelDataVisitor.
 */
export type ModelDataVisitorCallback = (model: string, data: any, scalarData: any) => void;

/**
 * Visitor that traverses data returned by a Prisma query.
 */
export class ModelDataVisitor {
    constructor(private modelMeta: ModelMeta) {}

    /**
     * Visits the given model data.
     */
    visit(model: string, data: any, callback: ModelDataVisitorCallback) {
        if (!data || typeof data !== 'object') {
            return;
        }

        const scalarData: Record<string, unknown> = {};
        const subTasks: Array<{ model: string; data: any }> = [];

        for (const [k, v] of Object.entries(data)) {
            const field = resolveField(this.modelMeta, model, k);
            if (field && field.isDataModel) {
                if (field.isArray && Array.isArray(v)) {
                    subTasks.push(...v.map((item) => ({ model: field.type, data: item })));
                } else {
                    subTasks.push({ model: field.type, data: v });
                }
            } else {
                scalarData[k] = v;
            }
        }

        callback(model, data, scalarData);
        subTasks.forEach(({ model, data }) => this.visit(model, data, callback));
    }
}
