import { SpaceUserRole } from '../.prisma';

export async function inviteUser(
    spaceId: string,
    userId: string,
    role: SpaceUserRole
) {
    const r = await fetch('/api/zen/function/invite-user', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            spaceId,
            userId,
            role,
        }),
    });
    return r.json();
}
