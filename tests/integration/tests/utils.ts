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
    execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, DO_NOT_TRACK: '1' },
    });
}

export async function setup(schemaFile: string) {
    const origDir = path.resolve('.');

    const workDir = path.resolve('tests/test-run');
    if (fs.existsSync(workDir)) {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(workDir, 'zenstack'), { recursive: true });
    process.chdir(workDir);

    const targetSchema = path.join(workDir, 'zenstack', 'schema.zmodel');
    fs.copyFileSync(path.join(origDir, schemaFile), targetSchema);

    // install dependencies
    fs.writeFileSync('.npmrc', `cache=${origDir}/.npmcache`);
    run('npm init -y');
    const dependencies = [
        'typescript',
        'swr',
        'react',
        'prisma',
        'zod',
        '../../../../packages/schema',
        '../../../../packages/runtime',
        '../../../../packages/internal',
    ];
    run(`npm i ${dependencies.join(' ')}`);

    // code generation
    run(`npx zenstack generate`);
    run(`npx zenstack migrate dev -n init`);

    fs.writeFileSync(
        'handler.ts',
        `
            import { NextApiRequest, NextApiResponse } from 'next';
            import { type RequestHandlerOptions, requestHandler } from '@zenstackhq/runtime/server';
            import service from '@zenstackhq/runtime';

            const options: RequestHandlerOptions = {
                async getServerUser(req: NextApiRequest, res: NextApiResponse) {
                    if (req.cookies.userId === '') {
                        // simulate "undefined" user id
                        return {} as { id: string};
                    } else if (req.cookies.userId) {
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

export function makeClient(apiPath: string, userId?: string, queryArgs?: any) {
    const [api, ...pathParts] = apiPath.split('/').filter((p) => p);
    if (api !== 'api') {
        throw new Error('apiPath must start with /api');
    }

    const query = {
        path: pathParts,
        ...(queryArgs ? { q: JSON.stringify(queryArgs) } : {}),
    };
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
            if (userId === undefined) {
                return Reflect.get(target, prop, receiver);
            }

            switch (prop) {
                case 'get':
                case 'post':
                case 'put':
                case 'del':
                case 'delete':
                    return (url: string) => {
                        // use userId cookie to simulate a logged in user
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
