import { PrismaClient } from './.prisma';

export class ZenStackClient {
    readonly prisma: PrismaClient;

    constructor() {
        this.prisma = new PrismaClient();
        this.prisma.todoList.findMany({
            select: {
                title: true,
            },
            where: {
                title: {
                    contains: 'hello',
                },
            },
        });
    }
}

const client = new ZenStackClient();
export default client;
