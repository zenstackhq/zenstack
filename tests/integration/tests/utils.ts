import * as tmp from 'tmp';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import request from 'supertest';
import { NextApiHandler } from 'next/types';
import supertest from 'supertest';

export function run(cmd: string) {
    execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
}

export async function setup() {
    const origDir = path.resolve('.');

    const { name: workDir } = tmp.dirSync();
    console.log('Work dir:', workDir);
    process.chdir(workDir);

    // const workDir = '/tmp/zen';
    // if (fs.existsSync(workDir)) {
    //     fs.rmSync(workDir, { recursive: true, force: true });
    // }
    // fs.mkdirSync(workDir);
    // process.chdir(workDir);

    const targetSchema = path.join(workDir, 'schema.zmodel');
    fs.copyFileSync(path.join(origDir, './tests/todo.zmodel'), targetSchema);

    fs.writeFileSync('.npmrc', `cache=${origDir}/.npmcache`);
    fs.copyFileSync(
        path.join(origDir, 'tests/package.template.json'),
        path.join(workDir, 'package.json')
    );
    fs.copyFileSync(
        path.join(origDir, 'tests/package-lock.template.json'),
        path.join(workDir, 'package-lock.json')
    );

    run('npm i typescript zenstack @zenstackhq/runtime');
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
                    if (req.cookies.userId) {
                        return { id: req.cookies.userId };
                    } else {
                        return undefined;
                    }
                },
            };
            export default requestHandler(service, options);
            `
    );

    fs.copyFileSync(
        path.join(origDir, 'tests/tsconfig.template.json'),
        path.join(workDir, 'tsconfig.json')
    );
    run('npx tsc');

    return workDir;
}

export function makeClient(apiPath: string, userId?: string) {
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

    const proxied = new Proxy(client, {
        get(
            target: supertest.SuperTest<supertest.Test>,
            prop: string | symbol,
            receiver: any
        ) {
            if (!userId) {
                return Reflect.get(target, prop, receiver);
            }

            switch (prop) {
                case 'get':
                case 'post':
                case 'put':
                case 'del':
                case 'delete':
                    return (url: string) => {
                        // debugger;
                        return target[prop](url).set('Cookie', [
                            `userId=${userId}`,
                        ]);
                    };
                default:
                    return Reflect.get(target, prop, receiver);
            }
        },
    });

    return proxied;
}
