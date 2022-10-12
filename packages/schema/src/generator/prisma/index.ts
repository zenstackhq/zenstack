import colors from 'colors';
import { Context, Generator } from '../types';
import { execSync } from 'child_process';
import PrismaSchemaGenerator from './schema-generator';
import QueryGuardGenerator from './query-gard-generator';

export default class PrismaGenerator implements Generator {
    async generate(context: Context) {
        // generate prisma schema
        const schemaFile = await new PrismaSchemaGenerator(context).generate();

        // run prisma generate and install @prisma/client
        await this.generatePrismaClient(schemaFile);

        // generate prisma query guard
        await new QueryGuardGenerator(context).generate();

        console.log(colors.blue(`  ✔️ Prisma schema and query code generated`));
    }

    async generatePrismaClient(schemaFile: string) {
        try {
            execSync('npx prisma -v');
        } catch (err) {
            execSync(`npm i prisma @prisma/client`);
            console.log(colors.blue('  ✔️ Prisma package installed'));
        }

        execSync(`npx prisma generate --schema "${schemaFile}"`);
    }
}
