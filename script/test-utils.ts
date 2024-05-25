import path from 'node:path';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

export const PNPM_STORE_PATH = path.resolve(__dirname, '../.pnpm-test-store');
export const NPM_RC_FILE = '.npmrc';
export const NPM_RC_CONTENTS = `store-dir = ${PNPM_STORE_PATH}`;
export const PACKAGE_JSON_FILE = 'package.json';
export const PACKAGE_JSON_CONTENTS = '{"name":"test-project","version":"1.0.0"}';

export function preparePackageJson(dependencies: {[key: string]: string} = {}, devDependencies: {[key: string]: string} = {}): string {
  const tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'zenstack-test-'));
  try {
  const packageJsonContents = 
`{
  "name":"test-project",
  "version":"1.0.0",
  "dependencies": {
    ${Object.entries(dependencies).map(([k, v]) => `"${k}": "${v}"`).join(',\n')}
  },
  "devDependencies": {
    ${Object.entries(devDependencies).map(([k, v]) => `"${k}": "${v}"`).join(',\n')}
  }
}`;

  initProjectDir(tmpDir, packageJsonContents, false);

  return packageJsonContents;
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
    console.log(`Loaded dependencies into store via temp dir ${tmpDir}`);
  }
}

function execCmdSync(cmd: string, path: string) {
  console.log(`Running: ${cmd}, in ${path}`);
  try {
      execSync(cmd, { cwd: path, stdio: 'ignore' });
  } catch (err) {
      console.error(`Test project scaffolding cmd error: ${err}`);
      throw err;
  }
}

export function initProjectDir(projectDir: string, packageJsonContents: string, offline = true) {
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  fs.writeFileSync(path.join(projectDir, PACKAGE_JSON_FILE), packageJsonContents, { flag: 'w+' });
  fs.writeFileSync(path.join(projectDir, NPM_RC_FILE), NPM_RC_CONTENTS, { flag: 'w+' });
  execCmdSync(`pnpm install ${offline ? '--offline ' : ''}--ignore-workspace`, projectDir);
}
