import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2168', () => {
    it('regression', async () => {
        await loadSchema(
            `
            datasource db {
                provider = "sqlite"
                url = "file:./test.db"

            }

            generator client {
                provider = "prisma-client"
                output = "../generated/prisma"
                moduleFormat = "cjs"
            }

            model User {
                id Int @id
                profile Profile @json
            }
            
            type Profile {
                age Int
            }
            `,
            {
                compile: true,
                addPrelude: false,
                output: './generated/zenstack',
                prismaLoadPath: './generated/prisma/client',
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import type { Profile } from './generated/zenstack/models';
const profile: Profile = { age: 18 };
console.log(profile);
`,
                    },
                ],
            }
        );
    });
});
