import { loadModel } from '@zenstackhq/testtools';

describe('Regression: issue 947', () => {
    it('regression', async () => {
        await loadModel(
            `
            model Test {
                id    String @id
                props TestEnum[] @default([])
              }
              
            enum TestEnum {
                A
                B
            }
            `
        );
    });
});
