import { loadModelWithError } from '../../utils';

describe('Cyclic inheritance', () => {
    it('abstract inheritance', async () => {
        const errors = await loadModelWithError(
            `
    abstract model A extends B {}
    abstract model B extends A {}
    model C extends B {
        id Int @id
    }
        `
        );
        expect(errors).toContain('Circular inheritance detected: A -> B -> A');
        expect(errors).toContain('Circular inheritance detected: B -> A -> B');
        expect(errors).toContain('Circular inheritance detected: C -> B -> A -> B');
    });

    it('delegate inheritance', async () => {
        const errors = await loadModelWithError(
            `
    model A extends B { 
        typeA String 
        @@delegate(typeA)
    }
    model B extends A {
        typeB String 
        @@delegate(typeB)
    }
    model C extends B {
        id Int @id
    }
        `
        );
        expect(errors).toContain('Circular inheritance detected: A -> B -> A');
        expect(errors).toContain('Circular inheritance detected: B -> A -> B');
        expect(errors).toContain('Circular inheritance detected: C -> B -> A -> B');
    });
});
