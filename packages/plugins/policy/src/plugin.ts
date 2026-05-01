import { AsyncLocalStorage } from 'node:async_hooks';
import { type OnKyselyQueryArgs, type RuntimePlugin } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { z } from 'zod';
import { check } from './functions';
import type { PolicyPluginOptions } from './options';
import { PolicyHandler } from './policy-handler';

export type { PolicyPluginOptions } from './options';

type PolicyQueryContext = Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;

const policyContextStorage = new AsyncLocalStorage<PolicyQueryContext>();

type PolicyExtQueryArgs = {
    $create: Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;
    $update: Pick<PolicyPluginOptions, 'fetchPolicyCodes'>;
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
        $create: fetchPolicyCodesSchema,
        $update: fetchPolicyCodesSchema,
    };

    // onQuery and onKyselyQuery are decoupled hook call sites with no shared argument path;
    // AsyncLocalStorage bridges the per-query fetchPolicyCodes arg into the Kysely executor.
    onQuery(ctx: {
        args: Record<string, unknown> | undefined;
        proceed: (args: Record<string, unknown> | undefined) => Promise<unknown>;
        [key: string]: unknown;
    }) {
        const fetchPolicyCodes = ctx.args?.['fetchPolicyCodes'] as boolean | undefined;
        if (fetchPolicyCodes !== undefined) {
            return policyContextStorage.run({ fetchPolicyCodes }, () => ctx.proceed(ctx.args));
        }
        return ctx.proceed(ctx.args);
    }

    onKyselyQuery({ query, client, proceed }: OnKyselyQueryArgs<SchemaDef>) {
        const ctx = policyContextStorage.getStore();
        const effectiveOptions: PolicyPluginOptions =
            ctx?.fetchPolicyCodes !== undefined
                ? { ...this.options, fetchPolicyCodes: ctx.fetchPolicyCodes }
                : this.options;
        const handler = new PolicyHandler<SchemaDef>(client, effectiveOptions);
        return handler.handle(query, proceed);
    }
}
