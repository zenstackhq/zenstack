import tm from '../syntaxes/zmodel.tmLanguage.json';
import { writeFileSync } from 'fs';
import { join } from 'path';

const tmPath = join(import.meta.dirname, '../syntaxes/zmodel.tmLanguage.json');

const control = tm.patterns.find((pattern) => pattern.name === 'keyword.control.zmodel-v3');

if (!control?.match) {
    throw new Error('Could not find control pattern/match');
}

const keywordsToRemove = new Set(['this', 'null', 'true', 'false', 'in']);

const pattern = /\((.+)\)/g;

const [, keywordsMatch] = pattern.exec(control.match) as RegExpExecArray;
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
    name: 'keyword.operator.expression.in',
    match: '\\b(in)\\b',
});

writeFileSync(tmPath, JSON.stringify(tm, null, 2));
