import type { BuiltinType, FieldDef, GetModels, SchemaDef } from '../schema';
import { DELEGATE_JOINED_FIELD_PREFIX } from './constants';
import { getCrudDialect } from './crud/dialects';
import type { BaseCrudDialect } from './crud/dialects/base-dialect';
import type { ClientOptions } from './options';
import { ensureArray, getField, getIdValues } from './query-utils';

export class ResultProcessor<Schema extends SchemaDef> {
    private dialect: BaseCrudDialect<Schema>;
    constructor(
        private readonly schema: Schema,
        options: ClientOptions<Schema>,
    ) {
        this.dialect = getCrudDialect(schema, options);
    }

    processResult(data: any, model: GetModels<Schema>, args?: any) {
        const result = this.doProcessResult(data, model);
        // deal with correcting the reversed order due to negative take
        this.fixReversedResult(result, model, args);
        return result;
    }

    private doProcessResult(data: any, model: GetModels<Schema>) {
        // pre-resolve field definitions from the first row's keys
        const firstRow = Array.isArray(data) ? data[0] : data;
        if (!firstRow || typeof firstRow !== 'object') {
            return data;
        }

        const fields = this.resolveFields(firstRow, model);

        if (Array.isArray(data)) {
            data.forEach((row, i) => (data[i] = this.processRow(row, fields)));
            return data;
        } else {
            return this.processRow(data, fields);
        }
    }

    private resolveFields(row: any, model: GetModels<Schema>): FieldDef[] {
        if (!row || typeof row !== 'object') {
            return [];
        }
        const result: FieldDef[] = [];
        for (const key of Object.keys(row)) {
            if (key === '_count' || key.startsWith(DELEGATE_JOINED_FIELD_PREFIX)) {
                continue;
            }
            const fieldDef = getField(this.schema, model, key);
            if (fieldDef) {
                result.push(fieldDef);
            }
        }
        return result;
    }

    private processRow(data: any, fields: FieldDef[]) {
        if (!data || typeof data !== 'object') {
            return data;
        }

        // handle special keys
        for (const key of Object.keys(data)) {
            const value = data[key];
            if (value === undefined) {
                continue;
            }

            if (key === '_count') {
                // underlying database provider may return string for count
                data[key] = typeof value === 'string' ? JSON.parse(value) : value;
            } else if (key.startsWith(DELEGATE_JOINED_FIELD_PREFIX)) {
                // merge delegate descendant fields
                if (value) {
                    // descendant fields are packed as JSON
                    const subRow = this.dialect.transformOutput(value, 'Json', false);

                    // process the sub-row
                    const subModel = key.slice(DELEGATE_JOINED_FIELD_PREFIX.length) as GetModels<Schema>;
                    const idValues = getIdValues(this.schema, subModel, subRow);
                    if (Object.values(idValues).some((v) => v === null || v === undefined)) {
                        // if the row doesn't have a valid id, the joined row doesn't exist
                        delete data[key];
                        continue;
                    }
                    const subFields = this.resolveFields(subRow, subModel);
                    const processedSubRow = this.processRow(subRow, subFields);

                    // merge the sub-row into the main row
                    Object.assign(data, processedSubRow);
                }
                delete data[key];
            }
        }

        // process regular fields using pre-resolved field definitions
        for (const fieldDef of fields) {
            const value = data[fieldDef.name];
            if (value === undefined) {
                continue;
            }

            if (value === null) {
                // scalar list defaults to empty array
                if (fieldDef.array && !fieldDef.relation) {
                    data[fieldDef.name] = [];
                }
                continue;
            }

            if (fieldDef.relation) {
                data[fieldDef.name] = this.processRelation(value, fieldDef);
            } else {
                data[fieldDef.name] = this.processFieldValue(value, fieldDef);
            }
        }

        return data;
    }

    private processFieldValue(value: unknown, fieldDef: FieldDef) {
        const type = fieldDef.type as BuiltinType;
        if (Array.isArray(value)) {
            value.forEach((v, i) => (value[i] = this.dialect.transformOutput(v, type, false)));
            return value;
        } else {
            return this.dialect.transformOutput(value, type, !!fieldDef.array);
        }
    }

    private processRelation(value: unknown, fieldDef: FieldDef) {
        let relationData = value;
        if (typeof value === 'string') {
            // relation can be returned as a JSON string
            try {
                relationData = JSON.parse(value);
            } catch {
                return value;
            }
        }
        return this.doProcessResult(relationData, fieldDef.type as GetModels<Schema>);
    }

    private fixReversedResult(data: any, model: GetModels<Schema>, args: any) {
        if (!data) {
            return;
        }

        if (Array.isArray(data) && typeof args === 'object' && args && args.take !== undefined && args.take < 0) {
            data.reverse();
        }

        const selectInclude = args?.include ?? args?.select;
        if (!selectInclude) {
            return;
        }

        for (const row of ensureArray(data)) {
            for (const [field, value] of Object.entries<any>(selectInclude)) {
                if (typeof value !== 'object' || !value) {
                    continue;
                }
                const fieldDef = getField(this.schema, model, field);
                if (!fieldDef || !fieldDef.relation || !fieldDef.array) {
                    continue;
                }
                this.fixReversedResult(row[field], fieldDef.type as GetModels<Schema>, value);
            }
        }
    }
}
