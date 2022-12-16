import { execSync } from '../../utils/exec-utils';
import { Context, Generator, GeneratorError } from '../types';
import QueryGuardGenerator from './query-guard-generator';
import PrismaSchemaGenerator from './schema-generator';

/**
 * Generates Prisma schema and db client
 */
export default class PrismaGenerator implements Generator {
    get name() {
        return 'prisma';
    }

    get startMessage() {
        return 'Generating Prisma client...';
    }

    get successMessage() {
        return 'Successfully generated Prisma client';
    }

    async generate(context: Context) {
        // generate prisma schema
        const schemaFile = await new PrismaSchemaGenerator(context).generate();

        // run prisma generate and install @prisma/client
        await this.generatePrismaClient(schemaFile);

        // generate prisma query guard
        await new QueryGuardGenerator(context).generate();

        return [];
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
