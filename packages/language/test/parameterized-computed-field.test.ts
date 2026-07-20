import { describe, it } from 'vitest';
import { loadSchema, loadSchemaWithError } from './utils';

const datasource = `
datasource db {
    provider = 'sqlite'
    url      = 'file:./dev.db'
}
`;

describe('Parameterized computed field', () => {
    it('parses a parameterized computed field (no colon before the return type)', async () => {
        await loadSchema(
            `
${datasource}
model User {
    id Int @id
    tagName(categoryId: Int) String? @computed
}
            `,
        );
    });

    it('rejects the old colon syntax before the return type', async () => {
        await loadSchemaWithError(
            `
${datasource}
model User {
    id Int @id
    tagName(categoryId: Int): String? @computed
}
            `,
            /expecting|unexpected|parsing error|mismatch|no viable/i,
        );
    });

    it('rejects parameters on a non-computed field', async () => {
        await loadSchemaWithError(
            `
${datasource}
model User {
    id Int @id
    tagName(categoryId: Int) String?
}
            `,
            /Only .*@computed.* fields can declare parameters/i,
        );
    });
});
