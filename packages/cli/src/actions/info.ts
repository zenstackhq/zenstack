import colors from 'colors';
import { getZenStackPackages } from './action-utils';

/**
 * CLI action for getting information about installed ZenStack packages
 */
export async function run(projectPath: string) {
    const packages = await getZenStackPackages(projectPath);
    if (!packages.length) {
        console.error('Unable to locate package.json. Are you in a valid project directory?');
        return;
    }

    console.log('Installed ZenStack Packages:');
    const versions = new Set<string>();
    for (const { pkg, version } of packages) {
        if (version) {
            versions.add(version);
        }
        console.log(`    ${colors.green(pkg.padEnd(20))}\t${version}`);
    }

    if (versions.size > 1) {
        console.warn(colors.yellow('WARNING: Multiple versions of Zenstack packages detected. This may cause issues.'));
    }
}
