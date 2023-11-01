import { loadModelWithError } from '../../utils';

describe('Toplevel Schema Validation Tests', () => {
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

    it('not exsited import', async () => {
        expect(
            await loadModelWithError(`
                import 'models/abc'
                datasource db1 {
                    provider = 'postgresql'
                    url = env('DATABASE_URL')
                }

                model X {id String @id }
        `)
        ).toContain('Cannot find model file models/abc.zmodel');
    });

    it('multiple auth models', async () => {
        expect(
            await loadModelWithError(`
                datasource db1 {
                    provider = 'postgresql'
                    url = env('DATABASE_URL')
                }

                model X {
                    id String @id 
                    @@auth
                }

                model Y {
                    id String @id 
                    @@auth
                }
                `)
        ).toContain('Multiple `@@auth` models are not allowed');
    });
});
