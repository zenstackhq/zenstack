import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1743', () => {
    it('regression', async () => {
        await loadSchema(
            `
            generator client {
                provider = "prisma-client-js"
                output = '../lib/zenstack/prisma'
            }

            datasource db {
                provider = "sqlite"
                url      = "file:./dev.db"
            }

            plugin enhancer {
                provider = '@core/enhancer'
                output = './lib/zenstack'
                compile = false
            }
            
            model User {
                id Int @id
            }
            `,
            {
                addPrelude: false,
                compile: true,
                output: './lib/zenstack',
                prismaLoadPath: './lib/zenstack/prisma',
            }
        );
    });
});
