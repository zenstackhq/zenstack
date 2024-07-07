import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1560', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
model User {
    id            String    @id @default(cuid())
    name          String
    ownedItems    OwnedItem[]
}

abstract model Base {
    id          String    @id @default(cuid())
    ownerId     String
    owner       User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
}

model OwnedItem extends Base {
  ownedItemType String
  @@delegate(ownedItemType)
}

model List extends OwnedItem {
    title String
}
            `,
            { enhancements: ['delegate'] }
        );

        const db = enhance();
        await db.user.create({ data: { id: '1', name: 'user1' } });
        await expect(
            db.list.create({ data: { id: '1', title: 'list1', owner: { connect: { id: '1' } } } })
        ).resolves.toMatchObject({
            id: '1',
            title: 'list1',
            ownerId: '1',
            ownedItemType: 'List',
        });
    });
});
