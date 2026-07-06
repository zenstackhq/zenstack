import path from 'node:path';
import * as ts from 'typescript';

/**
 * Detects the file extension that should be appended to relative imports in
 * generated TypeScript, by inspecting the nearest `tsconfig.json` to the given
 * directory.
 *
 * Returns `'.js'` when the project uses native ESM module resolution
 * (`node16`/`nodenext`), which requires explicit extensions on relative imports.
 * Returns `undefined` for `bundler`/`node` resolution (where extensionless
 * imports are the idiomatic, maximally-compatible form) or when no tsconfig is
 * found.
 */
export function detectImportFileExtension(fromDir: string): string | undefined {
    const configPath = ts.findConfigFile(fromDir, ts.sys.fileExists, 'tsconfig.json');
    if (!configPath) {
        return undefined;
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    if (configFile.error) {
        return undefined;
    }

    // resolve `extends` chains and module/moduleResolution defaults
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));

    // Prefer an explicit `moduleResolution`; when it's omitted, TypeScript derives
    // it from `module`, so fall back to inspecting the module kind ourselves.
    let moduleResolution = parsed.options.moduleResolution;
    if (moduleResolution === undefined) {
        switch (parsed.options.module) {
            case ts.ModuleKind.Node16:
            case ts.ModuleKind.Node18:
            case ts.ModuleKind.Node20:
            case ts.ModuleKind.NodeNext:
                moduleResolution = ts.ModuleResolutionKind.NodeNext;
                break;
            default:
                break;
        }
    }

    // node16/nodenext resolution requires explicit extensions on relative imports
    if (
        moduleResolution === ts.ModuleResolutionKind.Node16 ||
        moduleResolution === ts.ModuleResolutionKind.NodeNext
    ) {
        return '.js';
    }

    return undefined;
}
