import fs from 'fs';
import path from 'path';
import { execSync } from './exec-utils';

export type PackageManagers = 'npm' | 'yarn' | 'pnpm';

function getPackageManager(projectPath = '.'): PackageManagers {
    if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) {
        return 'yarn';
    } else if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) {
        return 'pnpm';
    } else {
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
