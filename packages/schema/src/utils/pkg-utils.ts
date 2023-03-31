import fs from 'fs';
import path from 'path';
import { execSync } from './exec-utils';

export type PackageManagers = 'npm' | 'yarn' | 'pnpm';

function findUp(names: string[], cwd: string): string | undefined {
    let dir = cwd;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const target = names.find((name) => fs.existsSync(path.join(dir, name)));
        if (target) return target;

        const up = path.resolve(dir, '..');
        if (up === dir) return undefined; // it'll fail anyway
        dir = up;
    }
}

function getPackageManager(projectPath = '.'): PackageManagers {
    const lockFile = findUp(['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'], projectPath);

    if (!lockFile) {
        // default use npm
        return 'npm';
    }

    switch (path.basename(lockFile)) {
        case 'yarn.lock':
            return 'yarn';
        case 'pnpm-lock.yaml':
            return 'pnpm';
        default:
            return 'npm';
    }
}
export function installPackage(
    pkg: string,
    dev: boolean,
    pkgManager: PackageManagers | undefined = undefined,
    tag = 'latest',
    projectPath = '.',
    exactVersion = true
) {
    const manager = pkgManager ?? getPackageManager(projectPath);
    console.log(`Installing package "${pkg}@${tag}" with ${manager}`);
    switch (manager) {
        case 'yarn':
            execSync(
                `yarn --cwd "${projectPath}" add ${exactVersion ? '--exact' : ''} ${pkg}@${tag} ${
                    dev ? ' --dev' : ''
                } --ignore-engines`
            );
            break;

        case 'pnpm':
            execSync(
                `pnpm add -C "${projectPath}" ${exactVersion ? '--save-exact' : ''} ${
                    dev ? ' --save-dev' : ''
                } ${pkg}@${tag}`
            );
            break;

        default:
            execSync(
                `npm install --prefix "${projectPath}" ${exactVersion ? '--save-exact' : ''} ${
                    dev ? ' --save-dev' : ''
                } ${pkg}@${tag}`
            );
            break;
    }
}

export function ensurePackage(
    pkg: string,
    dev: boolean,
    pkgManager: PackageManagers | undefined = undefined,
    tag = 'latest',
    projectPath = '.',
    exactVersion = false
) {
    const resolvePath = path.resolve(projectPath);
    try {
        require.resolve(pkg, { paths: [resolvePath] });
    } catch (err) {
        installPackage(pkg, dev, pkgManager, tag, resolvePath, exactVersion);
    }
}
