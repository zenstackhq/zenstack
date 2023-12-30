import { getPaths } from '@redwoodjs/cli-helpers';
import execa from 'execa';

/**
 * Utility for adding npm dependencies to "api" package
 */
export const addApiPackages = (apiPackages: { pkg: string; dev?: boolean }[]) => ({
    title: 'Adding required api packages...',
    task: async () => {
        const devPkgs = apiPackages.filter((p) => p.dev).map((p) => p.pkg);
        if (devPkgs.length > 0) {
            await execa('yarn', ['add', '-D', ...devPkgs], { cwd: getPaths().api.base });
        }

        const runtimePkgs = apiPackages.filter((p) => !p.dev).map((p) => p.pkg);
        if (runtimePkgs.length > 0) {
            await execa('yarn', ['add', ...runtimePkgs], { cwd: getPaths().api.base });
        }
    },
});
