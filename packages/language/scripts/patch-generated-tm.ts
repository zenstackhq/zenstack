/**
 * Post-processes syntaxes/zmodel.tmLanguage.json after `langium generate` to correct
 * highlighting for some keywords.
 */

import tm from '../syntaxes/zmodel.tmLanguage.json';
import { writeFileSync } from 'fs';
import { join } from 'path';

const tmPath = join(import.meta.dirname, '../syntaxes/zmodel.tmLanguage.json');
const control = tm.patterns.find((pattern) => pattern.name === 'keyword.control.zmodel-v3');

if (!control?.match) {
    throw new Error('Could not find control pattern/match');
}

const keywordsToRemove = new Set([
    'this',
    'null',
    'true',
    'false',
    'in',
    'type',
    'datasource',
    'model',
    'enum',
    'generator',
    'attribute',
    'view',
    'function',
    'mutation',
    'procedure',
    'plugin',
    'abstract',
    'extends',
    'with',
]);
const matchPattern = /\((.+)\)/g;
const [, keywordsMatch] = matchPattern.exec(control.match) as RegExpExecArray;
const keywordsArray = keywordsMatch.split('|').filter((keyword) => !keywordsToRemove.has(keyword));

control.match = control.match.replace(keywordsMatch, keywordsArray.join('|'));

tm.patterns.push({
    name: 'constant.language',
    match: '\\b(true|false|null)\\b',
});

tm.patterns.push({
    name: 'variable.language.this',
    match: '\\b(this)\\b',
});

tm.patterns.push({
    name: 'storage.modifier',
    match: '\\b(mutation|abstract|extends|with)\\b',
});

tm.patterns.push({
    name: 'storage.type',
    match: '\\b(type|datasource|model|enum|generator|attribute|view|function|procedure|plugin)\\b',
});

tm.patterns.push({
    name: 'keyword.operator.expression.in',
    match: '\\b(in)\\b',
});

writeFileSync(tmPath, JSON.stringify(tm, null, 2));
console.log('Patched syntaxes/zmodel.tmLanguage.json');
