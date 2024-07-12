import * as fs from 'fs';
import * as tmp from 'tmp';
import { createProgram } from '../../../../packages/schema/src/cli';

tmp.setGracefulCleanup();

describe('CLI format test', () => {
    let origDir: string;

    beforeEach(() => {
        origDir = process.cwd();
        const r = tmp.dirSync({ unsafeCleanup: true });
        console.log(`Project dir: ${r.name}`);
        process.chdir(r.name);
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('basic format', async () => {
        const model = `
        datasource db {provider="sqlite" url="file:./dev.db"}
        generator client {provider = "prisma-client-js"}
        model Post {id Int @id() @default(autoincrement())users User[]foo Unsupported("foo")}`;

        const formattedModel = `
datasource db {
    provider="sqlite"
    url="file:./dev.db"
}
generator client {
    provider = "prisma-client-js"
}
model Post {
    id Int @id() @default(autoincrement())
    users User[]
    foo Unsupported("foo")
}`;
        // set up schema
        fs.writeFileSync('schema.zmodel', model, 'utf-8');
        const program = createProgram();
        await program.parseAsync(['format', '--no-prisma-style'], { from: 'user' });

        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(formattedModel);
    });

    it('prisma format', async () => {
        const model = `
        datasource db {provider="sqlite" url="file:./dev.db"}
        generator client {provider = "prisma-client-js"}
        model Post {id Int @id() @default(autoincrement())users User[]foo Unsupported("foo")}`;

        const formattedModel = `
datasource db {
    provider="sqlite"
    url="file:./dev.db"
}
generator client {
    provider = "prisma-client-js"
}
model Post {
    id    Int                @id() @default(autoincrement())
    users User[]
    foo   Unsupported("foo")
}`;
        // set up schema
        fs.writeFileSync('schema.zmodel', model, 'utf-8');
        const program = createProgram();
        await program.parseAsync(['format'], { from: 'user' });

        expect(fs.readFileSync('schema.zmodel', 'utf-8')).toEqual(formattedModel);
    });
});
