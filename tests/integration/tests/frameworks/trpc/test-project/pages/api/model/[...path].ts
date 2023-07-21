import { NextRequestHandler } from '@zenstackhq/server/next';
import { enhance } from '@zenstackhq/runtime';
import { prisma } from '../../../server/db';

export default NextRequestHandler({
    getPrisma: (req, res) => enhance(prisma, { user: { id: 'user1' } }),
});
