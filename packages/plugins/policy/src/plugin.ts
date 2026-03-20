import { type OnKyselyQueryArgs, type RuntimePlugin } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { check } from './functions';
import { PolicyHandler, type PolicyHandlerOptions } from './policy-handler';

export type PolicyPluginOptions = PolicyHandlerOptions;

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
        const handler = new PolicyHandler<SchemaDef>(client, this.options);
        return handler.handle(query, proceed);
    }
}
