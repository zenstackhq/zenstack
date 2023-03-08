import path from 'path';
import { execSync } from './exec-utils';
import { findUpSync } from 'find-up';

export type PackageManagers = 'npm' | 'yarn' | 'pnpm';

function getPackageManager(projectPath = '.'): PackageManagers {
    const lockFile = findUpSync(['yarn.lock', 'pnpm-lock.yaml', 'package-lock.json'], {
        cwd: projectPath,
    });

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
    projectPath = '.'
) {
    const manager = pkgManager ?? getPackageManager(projectPath);
    console.log(`Installing package "${pkg}" with ${manager}`);
    switch (manager) {
        case 'yarn':
            execSync(`yarn --cwd "${projectPath}" add ${pkg}@${tag} ${dev ? ' --dev' : ''} --ignore-engines`);
            break;

        case 'pnpm':
            execSync(`pnpm add -C "${projectPath}" ${dev ? ' --save-dev' : ''} ${pkg}@${tag}`);
            break;

        default:
            execSync(`npm install --prefix "${projectPath}" ${dev ? ' --save-dev' : ''} ${pkg}@${tag}`);
            break;
    }
}

export function ensurePackage(
    pkg: string,
    dev: boolean,
    pkgManager: PackageManagers | undefined = undefined,
    tag = 'latest',
    projectPath = '.'
) {
    try {
        require(pkg);
    } catch {
        installPackage(pkg, dev, pkgManager, tag, projectPath);
    }
}
