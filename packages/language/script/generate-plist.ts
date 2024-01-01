// convert textmate grammar from json to plist with fixes

import { json2plist } from 'plist2';
import fs from 'fs';
import path from 'path';

const src = fs.readFileSync(path.resolve(__dirname, '../syntaxes/zmodel.tmLanguage.json'), 'utf-8');
const json = JSON.parse(src);
json['fileTypes'] = ['zmodel'];

const plist = json2plist(JSON.stringify(json));
fs.writeFileSync(path.resolve(__dirname, '../syntaxes/zmodel.tmLanguage'), plist, 'utf-8');
