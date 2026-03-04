import { type OnKyselyQueryArgs, type RuntimePlugin } from '@zenstackhq/orm';
import type { SchemaDef } from '@zenstackhq/orm/schema';
import { check } from './functions';
import { PolicyHandler } from './policy-handler';

export class PolicyPlugin implements RuntimePlugin<SchemaDef, {}, {}, {}> {
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
        const handler = new PolicyHandler<SchemaDef>(client);
        return handler.handle(query, proceed);
    }
}
