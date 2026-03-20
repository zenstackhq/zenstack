import { type OnKyselyQueryArgs, type RuntimePlugin } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { RawNode } from 'kysely';
import { check } from './functions';
import { PolicyHandler } from './policy-handler';

export type PolicyPluginOptions = {
    /**
     * Dangerously bypasses access-policy enforcement for raw SQL queries.
     * Raw queries remain in the current transaction, but the policy plugin will
     * not inspect or reject them.
     */
    dangerouslyAllowRawSql?: boolean;
};

export class PolicyPlugin implements RuntimePlugin<SchemaDef, {}, {}, {}> {
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

    onKyselyQuery({ query, client, proceed }: OnKyselyQueryArgs<SchemaDef>) {
        if (this.options.dangerouslyAllowRawSql && RawNode.is(query as never)) {
            return proceed(query);
        }
        const handler = new PolicyHandler<SchemaDef>(client);
        return handler.handle(query, proceed);
    }
}
