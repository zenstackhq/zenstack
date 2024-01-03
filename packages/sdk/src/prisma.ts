/* eslint-disable @typescript-eslint/no-var-requires */

import type { DMMF } from '@prisma/generator-helper';
import { getPrismaVersion } from '@zenstackhq/runtime';
import path from 'path';
import * as semver from 'semver';
import { GeneratorDecl, Model, Plugin, isGeneratorDecl, isPlugin } from './ast';
import { getLiteral } from './utils';

// reexport
export { getPrismaVersion } from '@zenstackhq/runtime';

/**
 * Given a ZModel and an import context directory, compute the import spec for the Prisma Client.
 */
export function getPrismaClientImportSpec(model: Model, importingFromDir: string) {
    const generator = model.declarations.find(
        (d) =>
            isGeneratorDecl(d) &&
            d.fields.some((f) => f.name === 'provider' && getLiteral(f.value) === 'prisma-client-js')
    ) as GeneratorDecl;

    const clientOutputField = generator?.fields.find((f) => f.name === 'output');
    const clientOutput = getLiteral(clientOutputField?.value);

    if (!clientOutput) {
        // no user-declared Prisma Client output location
        return '@prisma/client';
    }

    if (path.isAbsolute(clientOutput)) {
        // absolute path
        return clientOutput;
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const zmodelDir = path.dirname(model.$document!.uri.fsPath);

    // compute prisma schema absolute output path
    let prismaSchemaOutputDir = path.resolve(zmodelDir, './prisma');
    const prismaPlugin = model.declarations.find(
        (d) => isPlugin(d) && d.fields.some((f) => f.name === 'provider' && getLiteral(f.value) === '@core/prisma')
    ) as Plugin;
    if (prismaPlugin) {
        const output = getLiteral(prismaPlugin.fields.find((f) => f.name === 'output')?.value);
        if (output) {
            if (path.isAbsolute(output)) {
                // absolute prisma schema output path
                prismaSchemaOutputDir = path.dirname(output);
            } else {
                prismaSchemaOutputDir = path.dirname(path.resolve(zmodelDir, output));
            }
        }
    }

    // resolve the prisma client output path, which is relative to the prisma schema
    const resolvedPrismaClientOutput = path.resolve(prismaSchemaOutputDir, clientOutput);

    // DEBUG:
    // console.log('PRISMA SCHEMA PATH:', prismaSchemaOutputDir);
    // console.log('PRISMA CLIENT PATH:', resolvedPrismaClientOutput);
    // console.log('IMPORTING PATH:', importingFromDir);

    // compute prisma client absolute output dir relative to the importing file
    return normalizePath(path.relative(importingFromDir, resolvedPrismaClientOutput));
}

function normalizePath(p: string) {
    return p ? p.split(path.sep).join(path.posix.sep) : p;
}

export type GetDMMFOptions = {
    datamodel?: string;
    cwd?: string;
    prismaPath?: string;
    datamodelPath?: string;
    retry?: number;
    previewFeatures?: string[];
};

/**
 * Loads Prisma DMMF with appropriate version
 */
export function getDMMF(options: GetDMMFOptions, defaultPrismaVersion?: string): Promise<DMMF.Document> {
    const prismaVersion = getPrismaVersion() ?? defaultPrismaVersion;
    if (prismaVersion && semver.gte(prismaVersion, '5.0.0')) {
        const _getDMMF = require('@prisma/internals-v5').getDMMF;
        return _getDMMF(options);
    } else {
        const _getDMMF = require('@prisma/internals').getDMMF;
        return _getDMMF(options);
    }
}
