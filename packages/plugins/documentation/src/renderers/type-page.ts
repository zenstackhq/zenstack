import type { DataModel, TypeDef } from '@zenstackhq/language/ast';
import {
    getAttrName,
    getDefaultValue,
    getFieldAttributes,
    getFieldTypeName,
    isFieldRequired,
    stripCommentPrefix,
} from '../extractors';

export function renderTypePage(typeDef: TypeDef, _allModels: DataModel[]): string {
    const lines: string[] = [
        `[Index](../index.md)`,
        '',
        `# ${typeDef.name}`,
        '',
    ];

    const description = stripCommentPrefix(typeDef.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    const sortedFields = [...typeDef.fields].sort((a, b) => a.name.localeCompare(b.name));

    if (sortedFields.length > 0) {
        lines.push('## Fields', '');
        lines.push('| Field | Type | Required | Default | Attributes | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- |');

        for (const field of sortedFields) {
            const fieldDescription = stripCommentPrefix(field.comments);
            lines.push(
                `| ${field.name} | ${getFieldTypeName(field, false)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${fieldDescription} |`,
            );
        }
        lines.push('');
    }

    return lines.join('\n');
}
