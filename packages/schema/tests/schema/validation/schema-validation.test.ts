import { loadModelWithError } from '../../utils';

describe('Toplevel Schema Validation Tests', () => {
    it('no datasource', async () => {
        expect(await loadModelWithError('')).toContain(
            'Model must define a datasource'
        );
    });

    it('too many datasources', async () => {
        expect(
            await loadModelWithError(`
                datasource db1 {
                    provider = 'postgresql'
                    url = env('DATABASE_URL')
                }
                datasource db2 {
                    provider = 'postgresql'
                    url = env('DATABASE_URL')
                }
        `)
        ).toContain('Multiple datasource declarations are not allowed');
    });

    it('duplicated declaration names', async () => {
        expect(
            await loadModelWithError(`
                model X {id String @id }
                model X { id String @id }
        `)
        ).toContain('Duplicated declaration name "X"');
    });
});
