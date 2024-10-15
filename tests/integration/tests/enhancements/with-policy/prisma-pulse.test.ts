/* eslint-disable jest/no-conditional-expect */
import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

const PULSE_DB_URL = process.env.PULSE_DB_URL;
const PULSE_API_KEY = process.env.PULSE_API_KEY;

// eslint-disable-next-line jest/no-disabled-tests
describe.skip('With Policy: prisma pulse test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('should conform to auth check', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
        }

        model Post {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', auth() != null)
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: PULSE_DB_URL,
                pulseApiKey: PULSE_API_KEY,
                logPrismaQuery: true,
            }
        );

        await prisma.$queryRaw`ALTER TABLE public."Post" REPLICA IDENTITY FULL;`;
        await prisma.post.deleteMany();

        const rawSub = await prisma.post.stream();

        const anonDb = enhance();
        console.log('Anonymous db subscribing');
        const anonSub = await anonDb.post.stream();

        const authDb = enhance({ id: 1 });
        console.log('Auth db subscribing');
        const authSub = await authDb.post.stream();

        async function produce() {
            await prisma.post.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.post.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 1 } });
            console.log('deleted');
            await new Promise((resolve) => setTimeout(resolve, 3000));
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

    it('should conform to model-level policy', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', contains(name, 'hello'))
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: PULSE_DB_URL,
                pulseApiKey: PULSE_API_KEY,
                logPrismaQuery: true,
            }
        );

        await prisma.$queryRaw`ALTER TABLE public."Post" REPLICA IDENTITY FULL;`;
        await prisma.post.deleteMany();

        const rawSub = await prisma.post.stream();

        const enhanced = enhance();
        const enhancedSub = await enhanced.post.stream();

        async function produce() {
            await prisma.post.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.post.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.post.create({ data: { id: 2, name: 'hello world' } });
            console.log('created');
            await prisma.post.update({ where: { id: 2 }, data: { name: 'hello moon' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 2 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 3000));
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

    it('should work with partial subscription', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', contains(name, 'hello'))
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: PULSE_DB_URL,
                pulseApiKey: PULSE_API_KEY,
                logPrismaQuery: true,
            }
        );

        await prisma.$queryRaw`ALTER TABLE public."Post" REPLICA IDENTITY FULL;`;
        await prisma.post.deleteMany();

        const rawSub = await prisma.post.stream({ create: {} });

        const enhanced = enhance();
        const enhancedSub = await enhanced.post.stream({ create: {} });

        async function produce() {
            await prisma.post.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.post.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.post.create({ data: { id: 2, name: 'hello world' } });
            console.log('created');
            await prisma.post.update({ where: { id: 2 }, data: { name: 'hello moon' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 2 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 3000));
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

    it('should work with combination of policies and user-provided filters', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            name String

            @@allow('read', contains(name, 'hello'))
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: PULSE_DB_URL,
                pulseApiKey: PULSE_API_KEY,
                logPrismaQuery: true,
            }
        );

        await prisma.$queryRaw`ALTER TABLE public."Post" REPLICA IDENTITY FULL;`;
        await prisma.post.deleteMany();

        const rawSub = await prisma.post.stream({
            create: { name: { contains: 'world' } },
            update: { after: { name: { contains: 'world' } } },
            delete: { name: { contains: 'world' } },
        });

        const enhanced = enhance();
        const enhancedSub = await enhanced.post.stream({
            create: { name: { contains: 'world' } },
            update: { after: { name: { contains: 'world' } } },
            delete: { name: { contains: 'world' } },
        });

        async function produce() {
            await prisma.post.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.post.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.post.create({ data: { id: 2, name: 'good world' } });
            console.log('created');
            await prisma.post.update({ where: { id: 2 }, data: { name: 'nice world' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 2 } });
            console.log('deleted');

            await prisma.post.create({ data: { id: 3, name: 'hello world' } });
            console.log('created');
            await prisma.post.update({ where: { id: 3 }, data: { name: 'hello nice world' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 3 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 10000));
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

    it('should work with field-level policies', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            name String @allow('read', contains(name, 'hello'))

            @@allow('all', true)
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: PULSE_DB_URL,
                pulseApiKey: PULSE_API_KEY,
                logPrismaQuery: true,
            }
        );

        await prisma.$queryRaw`ALTER TABLE public."Post" REPLICA IDENTITY FULL;`;
        await prisma.post.deleteMany();

        const enhanced = enhance();
        const enhancedSub = await enhanced.post.stream();

        async function produce() {
            await prisma.post.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.post.update({ where: { id: 1 }, data: { name: 'abc1' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 1 } });
            console.log('deleted');

            await prisma.post.create({ data: { id: 2, name: 'hello1' } });
            console.log('created');
            await prisma.post.update({ where: { id: 2 }, data: { name: 'hello2' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 2 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 10000));
        }

        const enhancedEvents: any[] = [];
        await Promise.race([produce(), consume(enhancedSub, 'Enhanced', enhancedEvents)]);
        expect(enhancedEvents.length).toBe(6);
        expect(enhancedEvents.filter((e) => e.created?.name?.includes('abc'))).toHaveLength(0);
        expect(enhancedEvents.filter((e) => e.updated?.before?.name?.includes('abc'))).toHaveLength(0);
        expect(enhancedEvents.filter((e) => e.updated?.after?.name?.includes('abc'))).toHaveLength(0);
        expect(enhancedEvents.filter((e) => e.updated?.name?.includes('abc'))).toHaveLength(0);
        expect(enhancedEvents.filter((e) => e.deleted?.name?.includes('abc'))).toHaveLength(0);
    });

    it('should work with `@omit`', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            name String @omit

            @@allow('all', true)
        }
        `,
            {
                provider: 'postgresql',
                dbUrl: PULSE_DB_URL,
                pulseApiKey: PULSE_API_KEY,
                logPrismaQuery: true,
            }
        );

        await prisma.$queryRaw`ALTER TABLE public."Post" REPLICA IDENTITY FULL;`;
        await prisma.post.deleteMany();

        const enhanced = enhance();
        const enhancedSub = await enhanced.post.stream();

        async function produce() {
            await prisma.post.create({ data: { id: 1, name: 'abc' } });
            console.log('created');
            await prisma.post.update({ where: { id: 1 }, data: { name: 'bcd' } });
            console.log('updated');
            await prisma.post.delete({ where: { id: 1 } });
            console.log('deleted');

            await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        const enhancedEvents: any[] = [];
        await Promise.race([produce(), consume(enhancedSub, 'Enhanced', enhancedEvents)]);
        expect(enhancedEvents.length).toBe(3);

        for (const event of enhancedEvents) {
            switch (event.action) {
                case 'create':
                    expect(event.created.name).toBeUndefined();
                    break;
                case 'update':
                    expect(event.before?.name).toBeUndefined();
                    expect(event.after?.name).toBeUndefined();
                    break;
                case 'delete':
                    expect(event.deleted.name).toBeUndefined();
                    break;
            }
        }
    });
});

async function consume(subscription: any, name: string, events: any[]) {
    console.log('Consuming', name);
    for await (const event of subscription) {
        console.log(name, 'got event:', event);
        events.push(event);
    }
}
