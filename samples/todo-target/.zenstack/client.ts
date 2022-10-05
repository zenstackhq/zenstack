import { PrismaClient } from './.prisma';

export class ZenStackClient {
    readonly prisma = new PrismaClient();

    constructor() {}
}

export default new ZenStackClient();
