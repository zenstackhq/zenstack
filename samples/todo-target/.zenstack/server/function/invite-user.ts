import { SpaceUserRole } from '@zenstack/.prisma';
import { NextApiRequest, NextApiResponse } from 'next';
import handler from 'functions/invite-user';
import zenstack from '@zenstack/client';
import { RequestionHandlerOptions } from '..';
import { requireUser } from '../data/utils';

export default async function (
    req: NextApiRequest,
    res: NextApiResponse,
    path: string[],
    options: RequestionHandlerOptions
) {
    console.log('Handling function invite-user');
    const body: { spaceId: string; userId: string; role: SpaceUserRole } =
        req.body;

    const user = await requireUser(req, res, options);
    if (!user) {
        return;
    }

    const r = await handler(
        { db: zenstack.prisma, user },
        body.spaceId,
        body.userId,
        body.role
    );
    res.status(200).send(r);
}
