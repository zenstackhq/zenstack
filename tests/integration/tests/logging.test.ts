import path from 'path';
import { makeClient, run, setup } from './utils';
import * as fs from 'fs';
import type { DefaultService } from '../../../packages/runtime/server';

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

    it('logging with default settings', async () => {
        const service: DefaultService<any> = require('@zenstackhq/runtime');
        service.reinitialize();

        let gotInfoEmit = false;
        let gotQueryEmit = false;
        let gotVerboseEmit = false;
        let gotErrorEmit = false;

        let gotInfoStd = false;
        let gotQueryStd = false;
        let gotVerboseStd = false;
        let gotErrorStd = false;

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

        console.error = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes(':error')) {
                gotErrorStd = true;
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

        service.$on('error', (event) => {
            console.log('Got error', event);
            gotErrorEmit = true;
        });

        await makeClient('/api/data/User').post('/').send({
            data: {},
        });

        expect(gotQueryStd).toBeFalsy();
        expect(gotVerboseStd).toBeFalsy();
        expect(gotInfoStd).toBeFalsy();
        expect(gotErrorStd).toBeTruthy();

        expect(gotInfoEmit).toBeFalsy();
        expect(gotQueryEmit).toBeFalsy();
        expect(gotVerboseEmit).toBeFalsy();
        expect(gotErrorEmit).toBeFalsy();
    });

    it('logging with stdout', async () => {
        fs.writeFileSync(
            './zenstack.config.json',
            `
                {
                    "log": ["query", "verbose", "info", "error"]
                }
            `
        );

        const service: DefaultService<any> = require('@zenstackhq/runtime');
        service.reinitialize();

        let gotInfoEmit = false;
        let gotQueryEmit = false;
        let gotVerboseEmit = false;
        let gotErrorEmit = false;

        let gotInfoStd = false;
        let gotQueryStd = false;
        let gotVerboseStd = false;
        let gotErrorStd = false;

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

        console.error = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes(':error')) {
                gotErrorStd = true;
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

        service.$on('error', (event) => {
            console.log('Got error', event);
            gotErrorEmit = true;
        });

        await makeClient('/api/data/User').post('/').send({
            data: {},
        });

        expect(gotQueryStd).toBeTruthy();
        expect(gotVerboseStd).toBeTruthy();
        expect(gotInfoStd).toBeTruthy();
        expect(gotErrorStd).toBeTruthy();

        expect(gotInfoEmit).toBeFalsy();
        expect(gotQueryEmit).toBeFalsy();
        expect(gotVerboseEmit).toBeFalsy();
        expect(gotErrorEmit).toBeFalsy();
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
                        { "level": "error", "emit": "event" }
                    ]
                }
            `
        );

        const service: DefaultService<any> = require('@zenstackhq/runtime');
        service.reinitialize();

        let gotInfoEmit = false;
        let gotQueryEmit = false;
        let gotVerboseEmit = false;
        let gotErrorEmit = false;

        let gotInfoStd = false;
        let gotQueryStd = false;
        let gotVerboseStd = false;
        let gotErrorStd = false;

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

        console.error = jest.fn((...args) => {
            const msg = args?.[0] as string;
            if (msg.includes('zenstack:error')) {
                gotErrorStd = true;
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

        service.$on('error', (event) => {
            expect(event.timestamp).not.toBeUndefined();
            expect(event.message).not.toBeUndefined();
            gotErrorEmit = true;
        });

        await makeClient('/api/data/User').post('/').send({
            data: {},
        });

        expect(gotInfoEmit).toBeTruthy();
        expect(gotQueryEmit).toBeTruthy();
        expect(gotVerboseEmit).toBeTruthy();
        expect(gotErrorEmit).toBeTruthy();

        expect(gotInfoStd).toBeFalsy();
        expect(gotQueryStd).toBeFalsy();
        expect(gotVerboseStd).toBeFalsy();
        expect(gotErrorStd).toBeFalsy();
    });
});
