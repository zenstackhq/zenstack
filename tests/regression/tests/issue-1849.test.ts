import { FILE_SPLITTER, loadSchema } from '@zenstackhq/testtools';

describe('issue 1849', () => {
    it('regression', async () => {
        await loadSchema(
            `schema.zmodel
            import './enum'
            
            model Post {
              id Int @id
              status Status @default(PUBLISHED)
            }

            ${FILE_SPLITTER}enum.zmodel

            enum Status { 
              PENDING
              PUBLISHED
            }            
            `,
            { provider: 'postgresql', pushDb: false }
        );
    });
});
