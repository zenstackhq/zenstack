import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MigrationError, MigrationErrorReason } from './error';

/**
 * Dynamically loads a database driver package. Falls back to resolving it from the current
 * project folder, since a plain dynamic import fails when the CLI runs from a temp folder
 * (e.g. via npx/pnpm dlx). Throws a {@link MigrationError} if the package can't be found.
 */
export async function loadDriver(pkgName: string, installName = pkgName): Promise<any> {
    try {
        return await import(pkgName);
    } catch (importErr) {
        let projectRequire: NodeJS.Require | undefined;
        try {
            projectRequire = createRequire(path.resolve(process.cwd(), 'package.json'));
            const resolvedPath = projectRequire.resolve(pkgName);
            return await import(pathToFileURL(resolvedPath).href);
        } catch (resolvedImportErr) {
            try {
                return projectRequire!(pkgName);
            } catch (requireErr) {
                if (process.env['DEBUG']) {
                    console.error(importErr, resolvedImportErr, requireErr);
                }
                throw new MigrationError(
                    MigrationErrorReason.DRIVER_NOT_FOUND,
                    `Package "${installName}" is required. Install it with: npm install ${installName}`,
                );
            }
        }
    }
}
