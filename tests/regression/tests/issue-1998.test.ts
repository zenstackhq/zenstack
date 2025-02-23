import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1998', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Entity {
                id String @id
                type String
                updatable Boolean
                children Relation[] @relation("children")
                parents  Relation[] @relation("parents")

                @@delegate(type)                
                @@allow('create,read', true)
                @@allow('update', updatable)
            }

            model A extends Entity {}

            model B extends Entity {}

            model Relation {
                parent   Entity @relation("children", fields: [parentId], references: [id])
                parentId String
                child    Entity @relation("parents", fields: [childId], references: [id])
                childId  String

                @@allow('create', true)
                @@allow('read', check(parent, 'read') && check(child, 'read'))
                @@allow('delete', check(parent, 'update') && check(child, 'update'))

                @@id([parentId, childId])
            }            
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();

        await db.a.create({ data: { id: '1', updatable: true } });
        await db.b.create({ data: { id: '2', updatable: true } });
        await db.relation.create({ data: { parentId: '1', childId: '2' } });

        await expect(
            db.relation.deleteMany({
                where: { parentId: '1', childId: '2' },
            })
        ).resolves.toEqual({ count: 1 });

        await db.a.create({ data: { id: '3', updatable: false } });
        await db.b.create({ data: { id: '4', updatable: false } });
        await db.relation.create({ data: { parentId: '3', childId: '4' } });
        await expect(
            db.relation.deleteMany({
                where: { parentId: '3', childId: '4' },
            })
        ).resolves.toEqual({ count: 0 });
    });
});
