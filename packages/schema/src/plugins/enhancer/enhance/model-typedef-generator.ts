import { PluginError } from '@zenstackhq/sdk';
import { BuiltinType, DataModel, DataModelFieldType, TypeDef } from '@zenstackhq/sdk/ast';
import { SourceFile } from 'ts-morph';
import { match } from 'ts-pattern';
import { name } from '..';

export function generateTypeDefType(sourceFile: SourceFile, decl: DataModel | TypeDef) {
    sourceFile.addTypeAlias({
        name: decl.name,
        isExported: true,
        type: (writer) => {
            writer.block(() => {
                decl.fields.forEach((field) => {
                    writer.writeLine(
                        `${field.name}${field.type.optional ? '?' : ''}: ${zmodelTypeToTsType(field.type)};`
                    );
                });
            });
        },
    });
}

function zmodelTypeToTsType(type: DataModelFieldType) {
    let result: string;

    if (type.type) {
        result = builtinTypeToTsType(type.type);
    } else if (type.reference?.ref) {
        result = type.reference.ref.name;
    } else {
        throw new PluginError(name, `Unsupported field type: ${type}`);
    }

    if (type.array) {
        result += '[]';
    }

    return result;
}

function builtinTypeToTsType(type: BuiltinType) {
    return match(type)
        .with('Boolean', () => 'boolean')
        .with('BigInt', () => 'bigint')
        .with('Int', () => 'number')
        .with('Float', () => 'number')
        .with('Decimal', () => 'Prisma.Decimal')
        .with('String', () => 'string')
        .with('Bytes', () => 'Uint8Array')
        .with('DateTime', () => 'Date')
        .with('Json', () => 'unknown')
        .exhaustive();
}
