import fs from 'node:fs';
import path from 'node:path';
import tmp from 'tmp';

export function createTestProject(zmodelContent?: string) {
    const { name: workDir } = tmp.dirSync({ unsafeCleanup: true });

    fs.mkdirSync(path.join(workDir, 'node_modules'));

    // symlink all entries from "node_modules"
    const nodeModules = fs.readdirSync(path.join(__dirname, '../node_modules'));
    for (const entry of nodeModules) {
        if (entry.startsWith('@zenstackhq')) {
            continue;
        }
        fs.symlinkSync(
            path.join(__dirname, '../node_modules', entry),
            path.join(workDir, 'node_modules', entry),
            'dir',
        );
    }

    // in addition, symlink zenstack packages
    const zenstackPackages = ['language', 'sdk', 'schema', 'orm', 'cli'];
    fs.mkdirSync(path.join(workDir, 'node_modules/@zenstackhq'));
    for (const pkg of zenstackPackages) {
        fs.symlinkSync(
            path.join(__dirname, `../../${pkg}`),
            path.join(workDir, `node_modules/@zenstackhq/${pkg}`),
            'dir',
        );
    }

    fs.writeFileSync(
        path.join(workDir, 'package.json'),
        JSON.stringify(
            {
                name: 'test',
                version: '1.0.0',
                type: 'module',
            },
            null,
            4,
        ),
    );

    fs.writeFileSync(
        path.join(workDir, 'tsconfig.json'),
        JSON.stringify(
            {
                compilerOptions: {
                    module: 'ESNext',
                    target: 'ESNext',
                    moduleResolution: 'Bundler',
                    esModuleInterop: true,
                    skipLibCheck: true,
                    strict: true,
                },
                include: ['**/*.ts'],
            },
            null,
            4,
        ),
    );

    if (zmodelContent) {
        fs.writeFileSync(path.join(workDir, 'schema.zmodel'), zmodelContent);
    }

    return workDir;
}
