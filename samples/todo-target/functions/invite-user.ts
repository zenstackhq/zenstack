import { SpaceUserRole } from '@zenstack/.prisma';
import { FunctionContext } from '@zenstack/types';

async function func(
    context: FunctionContext,
    spaceId: string,
    userId: string,
    role: SpaceUserRole
) {
    const r = await context.db.spaceUser.create({
        data: {
            userId,
            spaceId,
            role,
        },
    });
    // send email
    return r;
}

export default func;
