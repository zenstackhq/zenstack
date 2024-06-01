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
  // Given that this is a loose file included from elsewhere, I couldn't rely on the tmp package here and had to go with built-in node functions. I saw no significant downsides in this case, versus the upside in developer experience of not needing to do a build step when changing these utils.
  const tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'zenstack-test-'));
  console.log(`Loading dependencies into store via temp dir ${tmpDir}`);
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

  // I considered doing a `pnpm store add` here instead of a plain install. While that worked, I decided against it in the end because it's a secondary way of processing the dependencies and I didn't see a significant downside to just installing and throwing the local project away right after.
  initProjectDir(tmpDir, packageJsonContents, false);

  return packageJsonContents;
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

export function initProjectDir(projectDir: string, packageJsonContents: string, offline = true) {
  try {
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
    fs.writeFileSync(path.join(projectDir, PACKAGE_JSON_FILE), packageJsonContents, { flag: 'w+' });
    fs.writeFileSync(path.join(projectDir, NPM_RC_FILE), NPM_RC_CONTENTS, { flag: 'w+' });
  } catch (e) {
    console.error(`Failed to set up project dir in ${projectDir}`);
    throw e;
  }

  try {
    execSync(`pnpm install ${offline ? '--offline ' : ''}--ignore-workspace`, {cwd: projectDir, stdio: 'ignore'});
  } catch (e) {
    console.error(`Failed to initialize project dependencies in ${projectDir}${offline ? '(offline mode)' : '(online mode)'}`);
    throw e;
  }
}
