import { type DMMF } from '@zenstackhq/sdk/prisma';
import { lowerCaseFirst } from 'lower-case-first';
import { CodeBlockWriter, SourceFile } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';

/**
 * Supported client helper types
 */
export type SupportedClientHelpers = 'react' | 'next' | 'nuxt';

/**
 * All supported client helper types
 */
export const AllSupportedClientHelpers: SupportedClientHelpers[] = ['react', 'next', 'nuxt'];

export function generateProcedure(
    writer: CodeBlockWriter,
    opType: string,
    typeName: string,
    modelName: string,
    baseOpType: string
) {
    const procType = getProcedureTypeByOpName(baseOpType);
    const prismaMethod = opType.replace('One', '');

    if (procType === 'query') {
        // the cast "as any" is to circumvent a TS compiler misfired error in certain cases
        writer.write(`
        ${opType}: procedure.input(${typeName}).query(({ctx, input}) => checkRead(db(ctx).${lowerCaseFirst(
            modelName
        )}.${prismaMethod}(input as any))),
    `);
    } else if (procType === 'mutation') {
        // the cast "as any" is to circumvent a TS compiler misfired error in certain cases
        writer.write(`
        ${opType}: procedure.input(${typeName}).mutation(async ({ctx, input}) => checkMutate(db(ctx).${lowerCaseFirst(
            modelName
        )}.${prismaMethod}(input as any))),
    `);
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function generateRouterSchemaImport(sourceFile: SourceFile, zodSchemasImport: string) {
    sourceFile.addStatements([
        `import * as _Schema from '${zodSchemasImport}/input';`,
        // temporary solution for dealing with the issue that Node.js wraps named exports under a `default`
        // key when importing from a CJS module
        `const $Schema: typeof _Schema = (_Schema as any).default ?? _Schema;`,
    ]);
}

export function generateHelperImport(sourceFile: SourceFile) {
    sourceFile.addStatements(`import { checkRead, checkMutate } from '../helper';`);
}

export const getInputSchemaByOpName = (opName: string, modelName: string) => {
    let inputType;
    const capModelName = upperCaseFirst(modelName);
    switch (opName) {
        case 'findUnique':
            inputType = `$Schema.${capModelName}InputSchema.findUnique`;
            break;
        case 'findFirst':
            inputType = `$Schema.${capModelName}InputSchema.findFirst.optional()`;
            break;
        case 'findMany':
            inputType = `$Schema.${capModelName}InputSchema.findMany.optional()`;
            break;
        case 'findRaw':
            inputType = `$Schema.${capModelName}InputSchema.findRawObject`;
            break;
        case 'createOne':
            inputType = `$Schema.${capModelName}InputSchema.create`;
            break;
        case 'createMany':
            inputType = `$Schema.${capModelName}InputSchema.createMany.optional()`;
            break;
        case 'deleteOne':
            inputType = `$Schema.${capModelName}InputSchema.delete`;
            break;
        case 'updateOne':
            inputType = `$Schema.${capModelName}InputSchema.update`;
            break;
        case 'deleteMany':
            inputType = `$Schema.${capModelName}InputSchema.deleteMany.optional()`;
            break;
        case 'updateMany':
            inputType = `$Schema.${capModelName}InputSchema.updateMany`;
            break;
        case 'upsertOne':
            inputType = `$Schema.${capModelName}InputSchema.upsert`;
            break;
        case 'aggregate':
            inputType = `$Schema.${capModelName}InputSchema.aggregate`;
            break;
        case 'aggregateRaw':
            inputType = `$Schema.${capModelName}InputSchema.aggregateRawObject`;
            break;
        case 'groupBy':
            inputType = `$Schema.${capModelName}InputSchema.groupBy`;
            break;
        case 'count':
            inputType = `$Schema.${capModelName}InputSchema.count.optional()`;
            break;
        default:
            break;
    }
    return inputType;
};

export const getProcedureTypeByOpName = (opName: string) => {
    let procType;
    switch (opName) {
        case 'findUnique':
        case 'findFirst':
        case 'findMany':
        case 'findRaw':
        case 'aggregate':
        case 'aggregateRaw':
        case 'groupBy':
        case 'count':
            procType = 'query';
            break;
        case 'createOne':
        case 'createMany':
        case 'deleteOne':
        case 'updateOne':
        case 'deleteMany':
        case 'updateMany':
        case 'upsertOne':
            procType = 'mutation';
            break;
        default:
            console.log('getProcedureTypeByOpName: ', { opName });
    }
    return procType;
};

export function resolveModelsComments(models: readonly DMMF.Model[], hiddenModels: string[]) {
    const modelAttributeRegex = /(@@Gen\.)+([A-z])+(\()+(.+)+(\))+/;
    const attributeNameRegex = /(?:\.)+([A-Za-z])+(?:\()+/;
    const attributeArgsRegex = /(?:\()+([A-Za-z])+:+(.+)+(?:\))+/;

    for (const model of models) {
        if (model.documentation) {
            const attribute = model.documentation?.match(modelAttributeRegex)?.[0];
            const attributeName = attribute?.match(attributeNameRegex)?.[0]?.slice(1, -1);
            if (attributeName !== 'model') continue;
            const rawAttributeArgs = attribute?.match(attributeArgsRegex)?.[0]?.slice(1, -1);

            const parsedAttributeArgs: Record<string, unknown> = {};
            if (rawAttributeArgs) {
                const rawAttributeArgsParts = rawAttributeArgs
                    .split(':')
                    .map((it) => it.trim())
                    .map((part) => (part.startsWith('[') ? part : part.split(',')))
                    .flat()
                    .map((it) => it.trim());

                for (let i = 0; i < rawAttributeArgsParts.length; i += 2) {
                    const key = rawAttributeArgsParts[i];
                    const value = rawAttributeArgsParts[i + 1];
                    parsedAttributeArgs[key] = JSON.parse(value);
                }
            }
            if (parsedAttributeArgs.hide) {
                hiddenModels.push(model.name);
            }
        }
    }
}
