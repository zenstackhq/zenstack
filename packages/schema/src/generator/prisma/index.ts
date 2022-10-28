import colors from 'colors';
import { Context, Generator, GeneratorError } from '../types';
import { execSync } from '../../utils/exec-utils';
import PrismaSchemaGenerator from './schema-generator';
import QueryGuardGenerator from './query-gard-generator';

/**
 * Generates Prisma schema and db client
 */
export default class PrismaGenerator implements Generator {
    async generate(context: Context): Promise<void> {
        // generate prisma schema
        const schemaFile = await new PrismaSchemaGenerator(context).generate();

        // run prisma generate and install @prisma/client
        await this.generatePrismaClient(schemaFile);

        // generate prisma query guard
        await new QueryGuardGenerator(context).generate();

        console.log(
            colors.blue(`  ✔️ Prisma schema and query guard generated`)
        );
    }

    private async generatePrismaClient(schemaFile: string) {
        try {
            execSync(`npx prisma generate --schema "${schemaFile}"`);
        } catch {
            throw new GeneratorError(
                `Failed to generate client code with Prisma. Check errors above for clues.\nThis normally shouldn't happen. Please file an issue at: http://go.zenstack.dev/bug.`
            );
        }
    }
}
