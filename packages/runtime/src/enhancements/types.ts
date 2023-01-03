import { FieldInfo, PolicyOperationKind, QueryContext } from '../types';

/**
 * ZModel data model metadata
 */
export type ModelMeta = { fields: Record<string, Record<string, FieldInfo>> };

/**
 * Function for getting policy guard with a given context
 */
export type PolicyFunc = (context: QueryContext) => object;

/**
 * Policy definition
 */
export type PolicyDef = {
    guard: Record<
        string,
        {
            allowAll?: boolean;
            denyAll?: boolean;
        } & Partial<Record<PolicyOperationKind, PolicyFunc>> & {
                preValueSelect?: object;
            }
    >;
};
