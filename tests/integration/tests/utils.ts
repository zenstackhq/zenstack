import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import request from 'supertest';
import { NextApiHandler } from 'next/types';
import supertest from 'supertest';
import superjson from 'superjson';
import { registerSerializers } from '../../../packages/runtime/src/serialization-utils';

export function run(cmd: string) {
    execSync(cmd, {
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env, DO_NOT_TRACK: '1' },
    });
}

export async function setup(schemaFile: string) {
    registerSerializers();

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
        'prisma@~4.7.0',
        'zod',
        '../../../../packages/schema',
        '../../../../packages/runtime/dist',
    ];
    run(`npm i ${dependencies.join(' ')}`);

    // code generation
    run(`npx zenstack generate`);
    run(`npx zenstack migrate dev -n init`);

    fs.writeFileSync(
        'handler.ts',
        `
            import { NextApiRequest, NextApiResponse } from 'next';
            import { type RequestHandlerOptions, requestHandler, default as service } from '@zenstackhq/runtime/server';

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
        ...(queryArgs ? { q: superjson.stringify(queryArgs) } : {}),
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

    // proxy test and superjson marshal post data
    const proxyTest = (test: supertest.Test) => {
        // return test;
        return new Proxy(test, {
            get(target: supertest.Test, prop: string | symbol, receiver: any) {
                if (prop === 'send') {
                    return (data: any) => {
                        return target.send(
                            JSON.parse(superjson.stringify(data))
                        );
                    };
                } else {
                    return Reflect.get(target, prop, receiver);
                }
            },
        });
    };

    const proxied = new Proxy(client, {
        get(
            target: supertest.SuperTest<supertest.Test>,
            prop: string | symbol,
            receiver: any
        ) {
            switch (prop) {
                case 'get':
                case 'post':
                case 'put':
                case 'del':
                case 'delete':
                    return (url: string) => {
                        const test = target[prop](url) as supertest.Test;

                        // use userId cookie to simulate a logged in user
                        if (userId) {
                            test.set('Cookie', [`userId=${userId}`]);
                        }

                        test.expect((resp) => {
                            if (
                                (resp.status === 200 || resp.status === 201) &&
                                resp.body
                            ) {
                                // unmarshal response
                                resp.body = superjson.parse(
                                    JSON.stringify(resp.body)
                                );
                            }
                        });

                        return proxyTest(test);
                    };

                default:
                    return Reflect.get(target, prop, receiver);
            }
        },
    });

    return proxied;
}
