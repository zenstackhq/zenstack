import { requestHandler } from '@zenstackhq/next';
import { withPresets } from '@zenstackhq/runtime';
import { prisma } from '../../../server/db';

export default requestHandler({
    getPrisma: (req, res) => withPresets(prisma, { user: { id: 'user1' } }),
});
