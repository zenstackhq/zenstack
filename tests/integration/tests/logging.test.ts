import path from 'path';
import { makeClient, run, setup } from './utils';
import * as fs from 'fs';
import type { DefaultService } from '../../../packages/runtime/src/service';

describe('Logging tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
        await setup('./tests/todo.zmodel');
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
    });

    const getService = () => require('@zenstackhq/runtime/server').default;

    it('logging with default settings', async () => {
        const service: DefaultService<any> = getService();
        service.reinitialize();

        let gotInfoEmit = false;
        let gotQueryEmit = false;
        let gotVerboseEmit = false;
        let gotWarnEmit = false;

        let gotInfoStd = false;
        let gotQueryStd = false;
        let gotVerboseStd = false;
        let gotWarnStd = false;

        console.log = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes('prisma:query')) {
                gotQueryStd = true;
            }
            if (msg.includes(':verbose')) {
                gotVerboseStd = true;
            }
            if (msg.includes(':info')) {
                gotInfoStd = true;
            }
        });

        console.warn = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes(':warn')) {
                gotWarnStd = true;
            }
        });

        service.$on('info', (event) => {
            console.log('Got info', event);
            gotInfoEmit = true;
        });

        service.$on('query', (event) => {
            console.log('Got query', event);
            gotQueryEmit = true;
        });

        service.$on('verbose', (event) => {
            console.log('Got verbose', event);
            gotVerboseEmit = true;
        });

        service.$on('warn', (event) => {
            console.log('Got warn', event);
            gotWarnEmit = true;
        });

        await makeClient('/api/data/User').post('/').send({
            data: {},
        });

        expect(gotQueryStd).toBeFalsy();
        expect(gotVerboseStd).toBeFalsy();
        expect(gotInfoStd).toBeFalsy();
        expect(gotWarnStd).toBeTruthy();

        expect(gotInfoEmit).toBeFalsy();
        expect(gotQueryEmit).toBeFalsy();
        expect(gotVerboseEmit).toBeFalsy();
        expect(gotWarnEmit).toBeFalsy();
    });

    it('logging with stdout', async () => {
        fs.writeFileSync(
            './zenstack.config.json',
            `
                {
                    "log": ["query", "verbose", "info", "warn"]
                }
            `
        );

        const service: DefaultService<any> = getService();
        service.reinitialize();

        let gotInfoEmit = false;
        let gotQueryEmit = false;
        let gotVerboseEmit = false;
        let gotWarnEmit = false;

        let gotInfoStd = false;
        let gotQueryStd = false;
        let gotVerboseStd = false;
        let gotWarnStd = false;

        console.log = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes(':query')) {
                gotQueryStd = true;
            }
            if (msg.includes(':verbose')) {
                gotVerboseStd = true;
            }
            if (msg.includes(':info')) {
                gotInfoStd = true;
            }
        });

        console.warn = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes(':warn')) {
                gotWarnStd = true;
            }
        });

        service.$on('info', (event) => {
            console.log('Got info', event);
            gotInfoEmit = true;
        });

        service.$on('query', (event) => {
            console.log('Got query', event);
            gotQueryEmit = true;
        });

        service.$on('verbose', (event) => {
            console.log('Got verbose', event);
            gotVerboseEmit = true;
        });

        service.$on('warn', (event) => {
            console.log('Got warn', event);
            gotWarnEmit = true;
        });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    email: 'abc@def.com',
                },
            });

        expect(gotQueryStd).toBeTruthy();
        expect(gotVerboseStd).toBeTruthy();
        expect(gotInfoStd).toBeTruthy();
        expect(gotWarnStd).toBeTruthy();

        expect(gotInfoEmit).toBeFalsy();
        expect(gotQueryEmit).toBeFalsy();
        expect(gotVerboseEmit).toBeFalsy();
        expect(gotWarnEmit).toBeFalsy();
    });

    it('logging with event', async () => {
        fs.writeFileSync(
            './zenstack.config.json',
            `
                {
                    "log": [
                        { "level": "query", "emit": "event" },
                        { "level": "verbose", "emit": "event" },
                        { "level": "info", "emit": "event" },
                        { "level": "warn", "emit": "event" }
                    ]
                }
            `
        );

        const service: DefaultService<any> = getService();
        service.reinitialize();

        let gotInfoEmit = false;
        let gotQueryEmit = false;
        let gotVerboseEmit = false;
        let gotWarnEmit = false;

        let gotInfoStd = false;
        let gotQueryStd = false;
        let gotVerboseStd = false;
        let gotWarnStd = false;

        console.log = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes(':query')) {
                gotQueryStd = true;
            }
            if (msg.includes(':verbose')) {
                gotVerboseStd = true;
            }
            if (msg.includes(':info')) {
                gotInfoStd = true;
            }
        });

        console.warn = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes('zenstack:warn')) {
                gotWarnStd = true;
            }
        });

        service.$on('info', (event) => {
            expect(event.timestamp).toBeTruthy();
            expect(event.message).toBeTruthy();
            gotInfoEmit = true;
        });

        service.$on('query', (event) => {
            expect(event.timestamp).not.toBeUndefined();
            expect(event.query).not.toBeUndefined();
            expect(event.duration).not.toBeUndefined();
            gotQueryEmit = true;
        });

        service.$on('verbose', (event) => {
            expect(event.timestamp).not.toBeUndefined();
            expect(event.message).not.toBeUndefined();
            gotVerboseEmit = true;
        });

        service.$on('warn', (event) => {
            expect(event.timestamp).not.toBeUndefined();
            expect(event.message).not.toBeUndefined();
            gotWarnEmit = true;
        });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    email: 'abc@def.com',
                },
            });

        expect(gotInfoEmit).toBeTruthy();
        expect(gotQueryEmit).toBeTruthy();
        expect(gotVerboseEmit).toBeTruthy();
        expect(gotWarnEmit).toBeTruthy();

        expect(gotInfoStd).toBeFalsy();
        expect(gotQueryStd).toBeFalsy();
        expect(gotVerboseStd).toBeFalsy();
        expect(gotWarnStd).toBeFalsy();
    });
});
