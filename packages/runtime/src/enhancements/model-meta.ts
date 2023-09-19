/* eslint-disable @typescript-eslint/no-var-requires */
import { lowerCaseFirst } from 'lower-case-first';
import { FieldInfo } from '../types';
import { ModelMeta } from './types';

/**
 * Resolves a model field to its metadata. Returns undefined if not found.
 */
export function resolveField(modelMeta: ModelMeta, model: string, field: string): FieldInfo | undefined {
    return modelMeta.fields[lowerCaseFirst(model)]?.[field];
}

/**
 * Gets all fields of a model.
 */
export function getFields(modelMeta: ModelMeta, model: string) {
    return modelMeta.fields[lowerCaseFirst(model)];
}
