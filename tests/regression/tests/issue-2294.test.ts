import { loadSchema } from '@zenstackhq/testtools';

describe('Issue 2294', () => {
    it('should work', async () => {
        await loadSchema(
            `
datasource db {
    provider = "sqlite"
    url = "file:./dev.db"
}

generator js {
    provider = "prisma-client"
    output = "./generated/client"
    moduleFormat = "cjs"
}

type AuthUser {
    id     Int @id
    name   String?

    @@auth
}
    
model Foo {
    id Int @id
    @@allow('all', auth().name == 'admin')
}
`,
            {
                addPrelude: false,
                output: './zenstack',
                prismaLoadPath: './prisma/generated/client/client',
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { enhance } from "./zenstack/enhance";
import { PrismaClient } from './prisma/generated/client/client';
enhance(new PrismaClient(), { user: { id: 1, name: 'admin' } });
                `,
                    },
                ],
            }
        );
    });
});
