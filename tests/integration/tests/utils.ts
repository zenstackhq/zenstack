import * as tmp from 'tmp';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import request from 'supertest';
import { NextApiHandler } from 'next/types';

export function run(cmd: string) {
    execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
}

export async function setup() {
    const { name: workDir } = tmp.dirSync();

    const origDir = path.resolve('.');
    const schema = path.resolve('./tests/todo.zmodel');
    const tsconfig = path.resolve('./tests/tsconfig.template.json');

    console.log('Work dir:', workDir);
    process.chdir(workDir);

    const targetSchema = path.join(workDir, 'schema.zmodel');
    fs.copyFileSync(schema, targetSchema);

    fs.writeFileSync('.npmrc', `cache=${origDir}/npmcache`);

    run('npm init -y');
    run('npm i typescript next-auth zenstack @zenstackhq/runtime');
    run(`npx zenstack generate ./schema.zmodel`);
    run(`npx prisma migrate dev --schema ./zenstack/schema.prisma -n init`);

    fs.writeFileSync(
        'handler.ts',
        `
            import { NextApiRequest, NextApiResponse } from 'next';
            import { type RequestHandlerOptions, requestHandler } from '@zenstackhq/runtime/server';
            import service from '@zenstackhq/runtime';

            const options: RequestHandlerOptions = {
                async getServerUser(req: NextApiRequest, res: NextApiResponse) {
                    return { id: 'user1' };
                },
            };
            export default requestHandler(service, options);
            `
    );

    fs.copyFileSync(tsconfig, path.join(workDir, 'tsconfig.json'));
    run('npx tsc');

    return workDir;
}

export function makeClient(apiPath: string) {
    const [api, ...pathParts] = apiPath.split('/').filter((p) => p);
    if (api !== 'api') {
        throw new Error('apiPath must start with /api');
    }
    const query = { path: pathParts };
    const testClient = (handler: NextApiHandler) =>
        request(
            createServer(async (req, res) => {
                return apiResolver(
                    req,
                    res,
                    query,
                    handler,
                    {
                        previewModeEncryptionKey: '',
                        previewModeId: '',
                        previewModeSigningKey: '',
                    },
                    false
                );
            })
        );
    const handler = require(path.resolve('handler.js'));
    const client = testClient(handler);
    return client;
}
