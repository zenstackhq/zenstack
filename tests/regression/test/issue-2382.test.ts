import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2382
describe('Regression for issue #2382', () => {
    it('allows club owner to link/unlink read-only activities', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id    String @id @default(uuid())
    clubs Club[]
}

model Club {
    id       String   @id @default(uuid())
    name     String
    ownerId  String
    owner    User     @relation(fields: [ownerId], references: [id])
    activities Activity[]

    @@allow('all', auth().id == ownerId)
}

model Activity {
    id      String @id @default(uuid())
    name    String
    clubs   Club[] @allow('update', auth() != null)

    @@allow('read', true)
}
`,
            { usePrismaPush: true },
        );
        const rawDb = db.$unuseAll();

        await rawDb.user.create({ data: { id: 'user-1' } });
        await rawDb.club.create({ data: { id: 'club-1', name: 'Chess Club', ownerId: 'user-1' } });
        await rawDb.activity.create({ data: { id: 'act-1', name: 'Tournament' } });

        const ownerDb = db.$setAuth({ id: 'user-1' });

        // Activity is read-only (no model-level update policy), but the field-level
        // allow on `clubs` enables the club owner to link it — this was rejected before the fix
        await expect(
            ownerDb.club.update({
                where: { id: 'club-1' },
                data: { activities: { connect: { id: 'act-1' } } },
            }),
        ).toResolveTruthy();

        // disconnect also works
        await expect(
            ownerDb.club.update({
                where: { id: 'club-1' },
                data: { activities: { disconnect: { id: 'act-1' } } },
            }),
        ).toResolveTruthy();

        // a non-owner cannot link (Club is not visible to them — read policy filters it out)
        const otherDb = db.$setAuth({ id: 'user-2' });
        await expect(
            otherDb.club.update({
                where: { id: 'club-1' },
                data: { activities: { connect: { id: 'act-1' } } },
            }),
        ).toBeRejectedNotFound();
    });
});
