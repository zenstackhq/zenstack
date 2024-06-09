import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

const DB_URL = '';
const PULSE_API_KEY = '';

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('With Policy: subscription test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('subscribe auth check', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
        }

        model Model {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', auth() != null)
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: DB_URL,
                pulseApiKey: PULSE_API_KEY,
            }
        );

        await prisma.model.deleteMany();

        const rawSub = await prisma.model.subscribe();

        const anonDb = enhance();
        console.log('Anonymous db subscribing');
        const anonSub = await anonDb.model.subscribe();

        const authDb = enhance({ id: 1 });
        console.log('Auth db subscribing');
        const authSub = await authDb.model.subscribe();

        async function produce() {
            await prisma.model.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.model.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 1 } });
            console.log('deleted');
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const rawEvents: any[] = [];
        const authEvents: any[] = [];
        const anonEvents: any[] = [];
        await Promise.race([
            produce(),
            consume(rawSub, 'Raw', rawEvents),
            consume(authSub, 'Auth', authEvents),
            consume(anonSub, 'Anonymous', anonEvents),
        ]);
        expect(rawEvents.length).toBe(3);
        expect(authEvents.length).toBe(3);
        expect(anonEvents.length).toBe(0);
    });

    it('subscribe model check', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', contains(name, 'hello'))
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: DB_URL,
                pulseApiKey: PULSE_API_KEY,
            }
        );

        await prisma.model.deleteMany();

        const rawSub = await prisma.model.subscribe();

        const enhanced = enhance();
        console.log('Auth db subscribing');
        const enhancedSub = await enhanced.model.subscribe();

        async function produce() {
            await prisma.model.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.model.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.model.create({ data: { id: 2, name: 'hello world' } });
            console.log('created');
            await prisma.model.update({ where: { id: 2 }, data: { name: 'hello moon' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 2 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const rawEvents: any[] = [];
        const enhancedEvents: any[] = [];
        await Promise.race([
            produce(),
            consume(rawSub, 'Raw', rawEvents),
            consume(enhancedSub, 'Enhanced', enhancedEvents),
        ]);
        expect(rawEvents.length).toBe(6);
        expect(enhancedEvents.length).toBe(3);
    });

    it('subscribe partial', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', contains(name, 'hello'))
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: DB_URL,
                pulseApiKey: PULSE_API_KEY,
            }
        );

        await prisma.model.deleteMany();

        const rawSub = await prisma.model.subscribe({ create: {} });

        const enhanced = enhance();
        console.log('Auth db subscribing');
        const enhancedSub = await enhanced.model.subscribe({ create: {} });

        async function produce() {
            await prisma.model.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.model.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.model.create({ data: { id: 2, name: 'hello world' } });
            console.log('created');
            await prisma.model.update({ where: { id: 2 }, data: { name: 'hello moon' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 2 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const rawEvents: any[] = [];
        const enhancedEvents: any[] = [];
        await Promise.race([
            produce(),
            consume(rawSub, 'Raw', rawEvents),
            consume(enhancedSub, 'Enhanced', enhancedEvents),
        ]);
        expect(rawEvents.length).toBe(2);
        expect(enhancedEvents.length).toBe(1);
    });

    it('subscribe mixed model check', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', contains(name, 'hello'))
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: DB_URL,
                pulseApiKey: PULSE_API_KEY,
            }
        );

        await prisma.model.deleteMany();

        const rawSub = await prisma.model.subscribe({
            create: { after: { name: { contains: 'world' } } },
            update: { after: { name: { contains: 'world' } } },
            delete: { before: { name: { contains: 'world' } } },
        });

        const enhanced = enhance();
        console.log('Auth db subscribing');
        const enhancedSub = await enhanced.model.subscribe({
            create: { after: { name: { contains: 'world' } } },
            update: { after: { name: { contains: 'world' } } },
            delete: { before: { name: { contains: 'world' } } },
        });

        async function produce() {
            await prisma.model.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.model.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.model.create({ data: { id: 2, name: 'good world' } });
            console.log('created');
            await prisma.model.update({ where: { id: 2 }, data: { name: 'nice world' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 2 } });
            console.log('deleted');

            await prisma.model.create({ data: { id: 3, name: 'hello world' } });
            console.log('created');
            await prisma.model.update({ where: { id: 3 }, data: { name: 'hello nice world' } });
            console.log('updated');
            await prisma.model.delete({ where: { id: 3 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const rawEvents: any[] = [];
        const enhancedEvents: any[] = [];
        await Promise.race([
            produce(),
            consume(rawSub, 'Raw', rawEvents),
            consume(enhancedSub, 'Enhanced', enhancedEvents),
        ]);
        expect(rawEvents.length).toBe(6);
        expect(enhancedEvents.length).toBe(3);
    });
});

async function consume(subscription: any, name: string, events: any[]) {
    console.log('Consuming', name);
    for await (const event of subscription) {
        console.log(name, 'got event:', event);
        events.push(event);
    }
}
