import { getDataModels, PluginError } from '@zenstackhq/sdk';
import { BuiltinType, Enum, isEnum, TypeDef, TypeDefFieldType } from '@zenstackhq/sdk/ast';
import { SourceFile } from 'ts-morph';
import { match } from 'ts-pattern';
import { name } from '..';

export function generateTypeDefType(sourceFile: SourceFile, decl: TypeDef) {
    sourceFile.addTypeAlias({
        name: decl.name,
        isExported: true,
        docs: decl.comments.map((c) => unwrapTripleSlashComment(c)),
        type: (writer) => {
            writer.block(() => {
                decl.fields.forEach((field) => {
                    if (field.comments.length > 0) {
                        writer.writeLine(`    /**`);
                        field.comments.forEach((c) => writer.writeLine(`     * ${unwrapTripleSlashComment(c)}`));
                        writer.writeLine(`     */`);
                    }
                    // optional fields are also nullable (to be consistent with Prisma)
                    writer.writeLine(
                        `    ${field.name}${field.type.optional ? '?' : ''}: ${zmodelTypeToTsType(field.type)}${
                            field.type.optional ? ' | null' : ''
                        };`
                    );
                });
            });
        },
    });
}

function unwrapTripleSlashComment(c: string): string {
    return c.replace(/^[/]*\s*/, '');
}

function zmodelTypeToTsType(type: TypeDefFieldType) {
    let result: string;

    if (type.type) {
        result = builtinTypeToTsType(type.type);
    } else if (type.reference?.ref) {
        if (isEnum(type.reference.ref)) {
            result = makeEnumTypeReference(type.reference.ref);
        } else {
            result = type.reference.ref.name;
        }
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

function makeEnumTypeReference(enumDecl: Enum) {
    const zmodel = enumDecl.$container;
    const models = getDataModels(zmodel);

    if (models.some((model) => model.fields.some((field) => field.type.reference?.ref === enumDecl))) {
        // if the enum is referenced by any data model, Prisma already generates its type,
        // we just need to reference it
        return enumDecl.name;
    } else {
        // otherwise, we need to inline the enum
        return enumDecl.fields.map((field) => `'${field.name}'`).join(' | ');
    }
}
