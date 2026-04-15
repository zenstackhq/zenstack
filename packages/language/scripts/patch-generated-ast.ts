/**
 * Post-processes src/generated/ast.ts after `langium generate` to inject runtime-only fields
 * that cannot be expressed via `declare module` augmentation due to tsdown's module path rewriting.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const astPath = join(import.meta.dirname, '../src/generated/ast.ts');

let content = readFileSync(astPath, 'utf8');

// Inject $resolvedParam into AttributeArg
if (!content.includes('$resolvedParam')) {
    content = content.replace(
        '    name?: RegularID;\n    value: Expression;\n}\n\nexport const AttributeArg',
        '    name?: RegularID;\n    value: Expression;\n    /** Resolved attribute param declaration */\n    $resolvedParam?: AttributeParam;\n}\n\nexport const AttributeArg',
    );
}

// Inject $allFields into DataModel
if (!content.includes('$allFields')) {
    content = content.replace(
        '    name: RegularID;\n}\n\nexport const DataModel',
        '    name: RegularID;\n    /** All fields including those marked with `@ignore` */\n    $allFields?: DataField[];\n}\n\nexport const DataModel',
    );
}

writeFileSync(astPath, content, 'utf8');
console.log('Patched src/generated/ast.ts');
