import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1667', () => {
    it('custom enhance standard zod output', async () => {
        await loadSchema(
            `
            generator client {
                provider = "prisma-client-js"
            }

            datasource db {
                provider = "sqlite"
                url      = "file:./dev.db"
            }            

            plugin enhancer {
                provider = '@core/enhancer'
                output = './zen'
            }

            model User {
                id Int @id
                email String @unique @email
            }
            `,
            { addPrelude: false, getPrismaOnly: true, preserveTsFiles: true }
        );
    });

    it('custom enhance custom zod output', async () => {
        await loadSchema(
            `
            generator client {
                provider = "prisma-client-js"
            }

            datasource db {
                provider = "sqlite"
                url      = "file:./dev.db"
            }            

            plugin enhancer {
                provider = '@core/enhancer'
                output = './zen'
            }

            plugin zod {
                provider = '@core/zod'
                output = './myzod'
            }

            model User {
                id Int @id
                email String @unique @email
            }
            `,
            { addPrelude: false, getPrismaOnly: true, generateNoCompile: true, compile: true }
        );
    });
});
