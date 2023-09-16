import colors from 'colors';
import fs from 'fs';
import path from 'path';
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
            const starterContent = fs.readFileSync(path.join(__dirname, '../res/starter.zmodel'), 'utf-8');
            fs.writeFileSync(zmodelFile, starterContent);
            sampleModelGenerated = true;
        }
    }

    ensurePackage('prisma', true, options.packageManager, 'latest', projectPath);
    ensurePackage('@prisma/client', false, options.packageManager, 'latest', projectPath);

    const tag = options.tag ?? getVersion();
    installPackage('zenstack', true, options.packageManager, tag, projectPath);
    installPackage('@zenstackhq/runtime', false, options.packageManager, tag, projectPath);

    if (sampleModelGenerated) {
        console.log(`Sample model generated at: ${colors.blue(zmodelFile)}

Please check the following guide on how to model your app:
    https://zenstack.dev/#/modeling-your-app.`);
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
