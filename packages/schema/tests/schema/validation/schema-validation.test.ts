import { loadModelWithError } from '@zenstackhq/testtools';

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
});
