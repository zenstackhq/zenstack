import { loadSchema } from '@zenstackhq/testtools';
import { POLYMORPHIC_SCHEMA } from './utils';
import path from 'path';

describe('Polymorphic Plugin Interaction Test', () => {
    it('tanstack-query', async () => {
        const tanstackPlugin = path.resolve(__dirname, '../../../../../packages/plugins/tanstack-query/dist');
        const schema = `
        ${POLYMORPHIC_SCHEMA}

        plugin hooks {
            provider = '${tanstackPlugin}'
            output = '$projectRoot/hooks'
            target = 'react'
            version = 'v5'
        }
        `;

        await loadSchema(schema, {
            compile: true,
            copyDependencies: [tanstackPlugin],
            extraDependencies: ['@tanstack/react-query'],
        });
    });
});
