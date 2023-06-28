import { NextRequestHandler } from '@zenstackhq/server/next';
import { withPresets } from '@zenstackhq/runtime';
import { prisma } from '../../../server/db';

export default NextRequestHandler({
    getPrisma: (req, res) => withPresets(prisma, { user: { id: 'user1' } }),
});
