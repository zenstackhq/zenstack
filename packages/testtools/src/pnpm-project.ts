import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import tmp from 'tmp';
import { getWorkspaceRoot } from './schema';

export const PNPM_STORE_PATH = path.resolve(__dirname, '../../../.pnpm-test-store');
export const NPM_RC_FILE = '.npmrc';
export const NPM_RC_CONTENTS = `store-dir = ${PNPM_STORE_PATH}`;
export const PACKAGE_JSON_FILE = 'package.json';
export const PACKAGE_JSON_CONTENTS = '{"name":"test-project","version":"1.0.0"}';

tmp.setGracefulCleanup();

export function preparePackageJson(dependencies: {[key: string]: string} = {}, devDependencies: {[key: string]: string} = {}, includeDefaults: boolean = true): string {
  const tmpDir = tmp.dirSync({ unsafeCleanup: true }).name;
  console.log(`Loading dependencies into store via temp dir ${tmpDir}`);
  try {
    const packageJsonContents = buildPackageJsonContents(dependencies, devDependencies, includeDefaults);

    // I considered doing a `pnpm store add` here instead of a plain install. While that worked, I decided against it in the end because it's a secondary way of processing the dependencies and I didn't see a significant downside to just installing and throwing the local project away right after.
    initProjectDir(tmpDir, packageJsonContents, false);

    return packageJsonContents;
  } finally {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  }
}

export function buildPackageJsonContents(dependencies: {[key: string]: string} = {}, devDependencies: {[key: string]: string} = {}, includeDefaults: boolean = true): string {
  if (includeDefaults) {
    dependencies = {
      "@prisma/client": "^5.14.0",
      "zod": "^3.21.0",
      "decimal.js": "^10.4.0",
      ...dependencies
    },
    devDependencies = {
      "prisma": "^5.14.0",
      "typescript": "^5.4.0",
      "@types/node": "^20.0.0",
      ...devDependencies
    }
  }

  const absoluteWorkspacePath = getWorkspaceRoot(__dirname);
  
  return `{
  "name":"test-project",
  "version":"1.0.0",
  "dependencies": {
    ${Object.entries(dependencies).map(([k, v]) => `"${k}": "${v}"`).join(',\n')}
  },
  "devDependencies": {
    ${Object.entries(devDependencies).map(([k, v]) => `"${k}": "${v}"`).join(',\n')}
  },
  "pnpm": {
    "overrides": {
      "@zenstackhq/language": "file:${absoluteWorkspacePath}/packages/language/dist",
      "@zenstackhq/sdk": "file:${absoluteWorkspacePath}/packages/sdk/dist",
      "@zenstackhq/runtime": "file:${absoluteWorkspacePath}/packages/runtime/dist"
    }
  }
}`;
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
    execSync(`pnpm install ${offline ? '--prefer-offline ' : ''}--ignore-workspace`, {cwd: projectDir, stdio: 'ignore'});
  } catch (e) {
    console.error(`Failed to initialize project dependencies in ${projectDir}${offline ? '(offline mode)' : '(online mode)'}`);
    throw e;
  }
}
