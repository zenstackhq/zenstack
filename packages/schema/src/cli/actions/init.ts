import colors from 'colors';
import fs from 'fs';
import path from 'path';
import pkgJson from '../../package.json';
import { PackageManagers, ensurePackage, installPackage } from '../../utils/pkg-utils';
import { getVersion } from '../../utils/version-utils';
import { CliError } from '../cli-error';
import { checkNewVersion } from '../cli-util';

type Options = {
    prisma: string | undefined;
    packageManager: PackageManagers | undefined;
    versionCheck: boolean;
    tag?: string;
};

/**
 * CLI action for initializing an existing project
 */
export async function init(projectPath: string, options: Options) {
    if (!fs.existsSync(projectPath)) {
        console.error(`Path does not exist: ${projectPath}`);
        throw new CliError('project path does not exist');
    }

    const defaultPrismaSchemaLocation = './prisma/schema.prisma';
    let prismaSchema = options.prisma;
    if (prismaSchema) {
        if (!fs.existsSync(prismaSchema)) {
            console.error(`Prisma schema file does not exist: ${prismaSchema}`);
            throw new CliError('prisma schema does not exist');
        }
    } else if (fs.existsSync(defaultPrismaSchemaLocation)) {
        prismaSchema = defaultPrismaSchemaLocation;
    }

    const zmodelFile = path.join(projectPath, './schema.zmodel');
    let sampleModelGenerated = false;

    if (fs.existsSync(zmodelFile)) {
        console.warn(`ZenStack model already exists at ${zmodelFile}, not generating a new one.`);
    } else {
        if (prismaSchema) {
            // copy over schema.prisma
            fs.copyFileSync(prismaSchema, zmodelFile);
        } else {
            // create a new model
            const starterContent = fs.readFileSync(path.join(__dirname, '../../res/starter.txt'), 'utf-8');
            fs.writeFileSync(zmodelFile, starterContent);
            sampleModelGenerated = true;
        }
    }

    const latestSupportedPrismaVersion = getLatestSupportedPrismaVersion();

    ensurePackage('prisma', true, options.packageManager, latestSupportedPrismaVersion, projectPath);
    ensurePackage('@prisma/client', false, options.packageManager, latestSupportedPrismaVersion, projectPath);

    const tag = options.tag ?? getVersion();
    installPackage('zenstack', true, options.packageManager, tag, projectPath);
    installPackage('@zenstackhq/runtime', false, options.packageManager, tag, projectPath);

    if (sampleModelGenerated) {
        console.log(`Sample model generated at: ${colors.blue(zmodelFile)}

Learn how to use ZenStack: https://zenstack.dev/docs.`);
    } else if (prismaSchema) {
        console.log(
            `Your current Prisma schema "${prismaSchema}" has been copied to "${zmodelFile}".
Moving forward please edit this file and run "zenstack generate" to regenerate Prisma schema.`
        );
    }

    console.log(colors.green('\nProject initialized successfully!'));

    if (options.versionCheck) {
        await checkNewVersion();
    }
}

function getLatestSupportedPrismaVersion() {
    const versionSpec = pkgJson.peerDependencies.prisma;
    let maxVersion: string | undefined;
    const hyphen = versionSpec.indexOf('-');
    if (hyphen > 0) {
        maxVersion = versionSpec.substring(hyphen + 1).trim();
    } else {
        maxVersion = versionSpec;
    }
    return maxVersion ?? 'latest';
}
