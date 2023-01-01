import { FieldInfo, PolicyOperationKind, QueryContext } from '../types';

export type ModelMeta = { fields: Record<string, Record<string, FieldInfo>> };

export type PolicyFunc = (context: QueryContext) => object;

export type PolicyDef = {
    guard: Record<
        string,
        {
            allowAll?: boolean;
            denyAll?: boolean;
        } & Partial<Record<PolicyOperationKind, PolicyFunc>>
    >;
};
