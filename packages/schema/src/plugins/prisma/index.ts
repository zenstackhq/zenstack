import {
    PluginError,
    type PluginFunction,
    type PluginOptions,
    getLiteral,
    normalizedRelative,
    resolvePath,
} from '@zenstackhq/sdk';
import { GeneratorDecl, isGeneratorDecl } from '@zenstackhq/sdk/ast';
import { getDMMF } from '@zenstackhq/sdk/prisma';
import colors from 'colors';
import fs from 'fs';
import path from 'path';
import stripColor from 'strip-color';
import telemetry from '../../telemetry';
import { execPackage } from '../../utils/exec-utils';
import { findUp } from '../../utils/pkg-utils';
import { PrismaSchemaGenerator } from './schema-generator';

export const name = 'Prisma';
export const description = 'Generating Prisma schema';

const run: PluginFunction = async (model, options, _dmmf, _globalOptions) => {
    // deal with calculation of the default output location
    const output = options.output
        ? resolvePath(options.output as string, options)
        : getDefaultPrismaOutputFile(options.schemaPath);

    const mergedOptions = { ...options, output } as unknown as PluginOptions;
    const { warnings, shortNameMap } = await new PrismaSchemaGenerator(model).generate(mergedOptions);

    // the path to import the prisma client from
    let prismaClientPath = '@prisma/client';

    // the real path where the prisma client was generated
    let clientOutputDir = '.prisma/client';

    // the path to the prisma client dts file
    let prismaClientDtsPath: string | undefined = undefined;

    if (options.generateClient !== false) {
        let generateCmd = `prisma generate --schema "${output}"`;
        if (typeof options.generateArgs === 'string') {
            generateCmd += ` ${options.generateArgs}`;
        }
        try {
            // run 'prisma generate'
            await execPackage(generateCmd, { stdio: 'ignore' });
        } catch {
            await trackPrismaSchemaError(output);
            try {
                // run 'prisma generate' again with output to the console
                await execPackage(generateCmd);
            } catch {
                // noop
            }
            throw new PluginError(name, `Failed to run "prisma generate"`);
        }

        // extract user-provided prisma client output path
        const generator = model.declarations.find(
            (d): d is GeneratorDecl =>
                isGeneratorDecl(d) &&
                d.fields.some((f) => f.name === 'provider' && getLiteral(f.value) === 'prisma-client-js')
        );
        const clientOutputField = generator?.fields.find((f) => f.name === 'output');
        const clientOutput = getLiteral<string>(clientOutputField?.value);

        if (clientOutput) {
            if (path.isAbsolute(clientOutput)) {
                prismaClientPath = clientOutput;
            } else {
                // first get absolute path based on prisma schema location
                const absPath = path.resolve(path.dirname(output), clientOutput);

                // then make it relative to the zmodel schema location
                prismaClientPath = normalizedRelative(path.dirname(options.schemaPath), absPath);
            }

            // record custom location where the prisma client was generated
            clientOutputDir = prismaClientPath;
        }

        // get PrismaClient dts path

        if (clientOutput) {
            // if a custom prisma client output path is configured, first try treating
            // clientOutputDir as a relative path and locate the index.d.ts file
            prismaClientDtsPath = path.resolve(path.dirname(options.schemaPath), clientOutputDir, 'index.d.ts');
        }

        if (!prismaClientDtsPath || !fs.existsSync(prismaClientDtsPath)) {
            // if the file does not exist, try node module resolution
            try {
                // the resolution is relative to the schema path by default
                let resolveBase = path.dirname(options.schemaPath);
                if (!clientOutput) {
                    // PrismaClient is generated into the default location, considering symlinked
                    // environments like pnpm, we need to first resolve "@prisma/client",and then
                    // resolve the ".prisma/client/index.d.ts" file relative to that
                    resolveBase = path.dirname(require.resolve('@prisma/client', { paths: [resolveBase] }));
                }
                const prismaClientResolvedPath = require.resolve(clientOutputDir, { paths: [resolveBase] });
                prismaClientDtsPath = path.join(path.dirname(prismaClientResolvedPath), 'index.d.ts');
            } catch (err) {
                console.warn(
                    colors.yellow(
                        `Could not resolve PrismaClient type declaration path. This may break plugins that depend on it.`
                    )
                );
            }
        }
    } else {
        console.warn(
            colors.yellow(
                'Skipping prisma client generation because "generateClient" is set to false. This may break plugins that depend on the prisma client.'
            )
        );
    }

    // load the result DMMF
    const dmmf = await getDMMF({
        datamodel: fs.readFileSync(output, 'utf-8'),
    });

    return { warnings, dmmf, prismaClientPath, prismaClientDtsPath, shortNameMap };
};

function getDefaultPrismaOutputFile(schemaPath: string) {
    // handle override from package.json
    const pkgJsonPath = findUp(['package.json'], path.dirname(schemaPath));
    if (pkgJsonPath) {
        const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (typeof pkgJson?.zenstack?.prisma === 'string') {
            if (path.isAbsolute(pkgJson.zenstack.prisma)) {
                return pkgJson.zenstack.prisma;
            } else {
                // resolve relative to package.json
                return path.resolve(path.dirname(pkgJsonPath), pkgJson.zenstack.prisma);
            }
        }
    }

    return resolvePath('./prisma/schema.prisma', { schemaPath });
}

export async function trackPrismaSchemaError(schema: string) {
    try {
        await getDMMF({ datamodel: fs.readFileSync(schema, 'utf-8') });
    } catch (err) {
        if (err instanceof Error) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            telemetry.track('prisma:error', { command: 'generate', message: stripColor(err.message) });
        }
    }
}

export default run;
