import fs from 'node:fs';
import path from 'node:path';
import { execSync } from './exec-utils';

export type PackageManagers = 'npm' | 'yarn' | 'pnpm';

/**
 * A type named FindUp that takes a type parameter e which extends boolean.
 * If e extends true, it returns a union type of string[] or undefined.
 * If e does not extend true, it returns a union type of string or undefined.
 *
 * @export
 * @template e A type parameter that extends boolean
 */
export type FindUp<e extends boolean> = e extends true ? string[] | undefined : string | undefined
/**
 * Find and return file paths by searching parent directories based on the given names list and current working directory (cwd) path.
 * Optionally return a single path or multiple paths.
 * If multiple allowed, return all paths found.
 * If no paths are found, return undefined.
 *
 * @export
 * @template [e=false]
 * @param names An array of strings representing names to search for within the directory
 * @param cwd A string representing the current working directory
 * @param [multiple=false as e] A boolean flag indicating whether to search for multiple levels. Useful for finding node_modules directories...
 * @param [result=[]] An array of strings representing the accumulated results used in multiple results
 * @returns Path(s) to a specific file or folder within the directory or parent directories
 */
export function findUp<e extends boolean = false>(names: string[], cwd: string = process.cwd(), multiple: e = false as e, result: string[] = []): FindUp<e> {
    if (!names.some((name) => !!name)) return undefined;
    const target = names.find((name) => fs.existsSync(path.join(cwd, name)));
    if (multiple == false && target) return path.join(cwd, target) as FindUp<e>;
    if (target) result.push(path.join(cwd, target));
    const up = path.resolve(cwd, '..');
    if (up === cwd) return (multiple && result.length > 0 ? result : undefined) as FindUp<e>; // it'll fail anyway
    return findUp(names, up, multiple, result);
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
                `yarn --cwd "${projectPath}" add ${exactVersion ? '--exact' : ''} ${pkg}@${tag} ${dev ? ' --dev' : ''}`
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

/**
 * A function that searches for the nearest package.json file starting from the provided search path or the current working directory if no search path is provided.
 * It iterates through the directory structure going one level up at a time until it finds a package.json file. If no package.json file is found, it returns undefined.
 * @deprecated Use findUp instead @see findUp
 */
export function findPackageJson(searchPath?: string) {
    let currDir = searchPath ?? process.cwd();
    while (currDir) {
        const pkgJsonPath = path.join(currDir, 'package.json');
        if (fs.existsSync(pkgJsonPath)) {
            return pkgJsonPath;
        }
        const up = path.resolve(currDir, '..');
        if (up === currDir) {
            return undefined;
        }
        currDir = up;
    }
    return undefined;
}

export function getPackageJson(searchPath?: string) {
    const pkgJsonPath = findUp(['package.json'], searchPath ?? process.cwd());
    if (pkgJsonPath) {
        return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } else {
        return undefined;
    }
}
