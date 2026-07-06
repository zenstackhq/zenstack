import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({
    entry: {
        index: 'src/index.ts',
        schema: 'src/schema.ts',
        helpers: 'src/helpers.ts',
        'common-types': 'src/common-types.ts',
        'dialects/sqlite': 'src/dialects/sqlite.ts',
        'dialects/postgres': 'src/dialects/postgres.ts',
        'dialects/mysql': 'src/dialects/mysql.ts',
        'dialects/sql.js': 'src/dialects/sql.js/index.ts',
    },
});
