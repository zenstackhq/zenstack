import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1574', () => {
    it('regression', async () => {
        const { enhance, prisma } = await loadSchema(
            `
model User {
    id String @id @default(cuid())
    modelA ModelA[]
}

//
// ModelA has model-level access-all by owner, but read-all override for the name property
//
model ModelA {
    id String @id @default(cuid())

    owner User @relation(fields: [ownerId], references: [id])
    ownerId String

    name String @allow('read', true, true)
    prop2 String?

    refsB ModelB[]
    refsC ModelC[]

    @@allow('all', owner == auth())
}

//
// ModelB and ModelC are both allow-all everyone.
// They both have a reference to ModelA, but in ModelB that reference is optional.
//
model ModelB {
    id String @id @default(cuid())

    ref ModelA? @relation(fields: [refId], references: [id])
    refId String?

    @@allow('all', true)
}
model ModelC {
    id String @id @default(cuid())

    ref ModelA @relation(fields: [refId], references: [id])
    refId String

    @@allow('all', true)
}
        `,
            { enhancements: ['policy'] }
        );

        // create two users
        const user1 = await prisma.user.create({ data: { id: '1' } });
        const user2 = await prisma.user.create({ data: { id: '2' } });

        // create two db instances, enhanced for users 1 and 2
        const db1 = enhance(user1);
        const db2 = enhance(user2);

        // create a ModelA owned by user1
        const a = await db1.modelA.create({ data: { name: 'a', ownerId: user1.id } });

        // create a ModelB and a ModelC with refs to ModelA
        const b = await db1.modelB.create({ data: { refId: a.id } });
        const c = await db2.modelC.create({ data: { refId: a.id } });

        // works: user1 should be able to read b as well as the entire referenced a
        const t1 = await db1.modelB.findFirst({ select: { ref: true } });
        expect(t1.ref.name).toBeTruthy();

        // works: user1 also should be able to read b as well as the name of the referenced a
        const t2 = await db1.modelB.findFirst({ select: { ref: { select: { name: true } } } });
        expect(t2.ref.name).toBeTruthy();

        // works: user2 also should be able to read b as well as the name of the referenced a
        const t3 = await db2.modelB.findFirst({ select: { ref: { select: { name: true } } } });
        expect(t3.ref.name).toBeTruthy();

        // works: but user2 should not be able to read b with the entire referenced a
        const t4 = await db2.modelB.findFirst({ select: { ref: true } });
        expect(t4.ref).toBeFalsy();

        //
        // The following are essentially the same tests, but with ModelC instead of ModelB
        //

        // works: user1 should be able to read c as well as the entire referenced a
        const t5 = await db1.modelC.findFirst({ select: { ref: true } });
        expect(t5.ref.name).toBeTruthy();

        // works: user1 also should be able to read c as well as the name of the referenced a
        const t6 = await db1.modelC.findFirst({ select: { ref: { select: { name: true } } } });
        expect(t6.ref.name).toBeTruthy();

        // works: user2 should not be able to read b along with the a reference.
        // In this case, the entire query returns null because of the required (but inaccessible) ref.
        await expect(db2.modelC.findFirst({ select: { ref: true } })).toResolveFalsy();

        // works: if user2 queries c directly and gets the refId to a, it can get the a.name directly
        const t7 = await db2.modelC.findFirstOrThrow();
        await expect(db2.modelA.findFirst({ select: { name: true }, where: { id: t7.refId } })).toResolveTruthy();

        // fails: since the last query worked, we'd expect to be able to query c along with the name of the referenced a directly
        await expect(db2.modelC.findFirst({ select: { ref: { select: { name: true } } } })).toResolveTruthy();
    });
});
