import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2175', () => {
    it('regression standard generator', async () => {
        await loadSchema(
            `
        model User {
            id    Int     @id @default(autoincrement())
            email String  @unique
            posts Post[]
        }   

        model Post {
            id        Int     @id @default(autoincrement())
            title     String
            author    User?   @relation(fields: [authorId], references: [id])
            authorId  Int?    @default(auth().id)
        }
        
        `,
            {
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { PrismaClient } from "@prisma/client";
import { enhance } from ".zenstack/enhance";

const prisma = new PrismaClient();
const prismaExtended = prisma.$extends({
  model: {
    user: {
      async signUp(email: string) {
        return prisma.user.create({ data: { email } });
      },
    },
  },
});

const dbExtended = enhance(prismaExtended);

async function main() {
  const newUser = await dbExtended.user.signUp("a@b.com");
  console.log(newUser);
}

main();
`,
                    },
                ],
            }
        );
    });

    it('regression new generator', async () => {
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
            id    Int     @id @default(autoincrement())
            email String  @unique
            posts Post[]
        }   

        model Post {
            id        Int     @id @default(autoincrement())
            title     String
            author    User?   @relation(fields: [authorId], references: [id])
            authorId  Int?    @default(auth().id)
        }
        
        `,
            {
                addPrelude: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { PrismaClient } from "./generated/prisma/client";
import { enhance } from "./generated/zenstack/enhance";

const prisma = new PrismaClient();
const prismaExtended = prisma.$extends({
  model: {
    user: {
      async signUp(email: string) {
        return prisma.user.create({ data: { email } });
      },
    },
  },
});

const dbExtended = enhance(prismaExtended);

async function main() {
  const newUser = await dbExtended.user.signUp("a@b.com");
  console.log(newUser);
}

main();
`,
                    },
                ],
                output: './generated/zenstack',
                prismaLoadPath: './generated/prisma/client',
            }
        );
    });
});
