import colors from 'colors';
import getLatestVersion from 'get-latest-version';
import ora from 'ora';
import semver from 'semver';
import { getZenStackPackages } from '../cli-util';

/**
 * CLI action for getting information about installed ZenStack packages
 */
export async function info(projectPath: string) {
    const packages = getZenStackPackages(projectPath);
    if (!packages) {
        console.error('Unable to locate package.json. Are you in a valid project directory?');
        return;
    }

    console.log('Installed ZenStack Packages:');
    const versions = new Set<string>();
    for (const { pkg, version } of packages) {
        versions.add(version);
        console.log(`    ${colors.green(pkg.padEnd(20))}\t${version}`);
    }

    if (versions.size > 1) {
        console.warn(colors.yellow('WARNING: Multiple versions of Zenstack packages detected. This may cause issues.'));
    } else if (versions.size > 0) {
        const spinner = ora('Checking npm registry').start();
        const latest = await getLatestVersion('zenstack');

        if (!latest) {
            spinner.fail('unable to check for latest version');
        } else {
            spinner.succeed();
            const version = [...versions][0];
            if (semver.gt(latest, version)) {
                console.log(`A newer version of Zenstack is available: ${latest}.`);
            } else if (semver.gt(version, latest)) {
                console.log('You are using a pre-release version of Zenstack.');
            } else {
                console.log('You are using the latest version of Zenstack.');
            }
        }
    }
}
