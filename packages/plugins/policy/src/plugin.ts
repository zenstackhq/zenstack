import { type OnKyselyQueryArgs, type RuntimePlugin } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { z } from 'zod';
import { check } from './functions';
import type { PolicyPluginOptions } from './options';
import { PolicyHandler } from './policy-handler';

export type { PolicyPluginOptions } from './options';

type PolicyExtQueryArgs = {
    $read: Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;
    $create: Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;
    $update: Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;
    $delete: Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;
};

const fetchPolicyCodesSchema = z.object({ fetchPolicyCodes: z.boolean().optional() });

export class PolicyPlugin implements RuntimePlugin<SchemaDef, PolicyExtQueryArgs, {}, {}> {
    constructor(private readonly options: PolicyPluginOptions = {}) {}

    get id() {
        return 'policy' as const;
    }

    get name() {
        return 'Access Policy';
    }

    get description() {
        return 'Enforces access policies defined in the schema.';
    }

    get functions() {
        return {
            check,
        };
    }

    readonly queryArgs = {
        $read: fetchPolicyCodesSchema,
        $create: fetchPolicyCodesSchema,
        $update: fetchPolicyCodesSchema,
        $delete: fetchPolicyCodesSchema,
    };

    onKyselyQuery({ query, client, proceed, queryContext }: OnKyselyQueryArgs<SchemaDef>) {
        const fetchPolicyCodes = queryContext?.pluginArgs?.['fetchPolicyCodes'] as boolean | undefined;
        const effectiveOptions: PolicyPluginOptions =
            fetchPolicyCodes !== undefined ? { ...this.options, fetchPolicyCodes } : this.options;
        const handler = new PolicyHandler<SchemaDef>(client, effectiveOptions, queryContext?.ormOperation);
        return handler.handle(query, proceed);
    }
}
