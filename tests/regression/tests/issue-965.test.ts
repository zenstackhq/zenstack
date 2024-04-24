import { loadModel, loadModelWithError } from '@zenstackhq/testtools';

describe('Regression: issue 965', () => {
    it('regression1', async () => {
        await loadModel(`
        abstract model Base {
            id String @id @default(cuid())
        }
        
        abstract model A {
            URL String? @url
        }
        
        abstract model B {
            anotherURL String? @url
        }
        
        abstract model C {
            oneMoreURL String? @url
        }
        
        model D extends Base, A, B {
        }
        
        model E extends Base, B, C {
        }`);
    });

    it('regression2', async () => {
        await expect(
            loadModelWithError(`
        abstract model A {
            URL String? @url
        }
        
        abstract model B {
            anotherURL String? @url
        }
        
        abstract model C {
            oneMoreURL String? @url
        }
        
        model D extends A, B {
        }
        
        model E extends B, C {
        }`)
        ).resolves.toContain(
            'Model must have at least one unique criteria. Either mark a single field with `@id`, `@unique` or add a multi field criterion with `@@id([])` or `@@unique([])` to the model.'
        );
    });
});
