import { createPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('issue 2028', () => {
    it('regression', async () => {
        const dbUrl = await createPostgresDb('issue-2028');
        const { enhance, zodSchemas } = await loadSchema(
            `
enum FooType {
    Bar
    Baz
}

model User {
    id          String       @id @default(cuid())
    userFolders UserFolder[]
    @@allow('all', true)
}

model Foo {
    id          String       @id @default(cuid())
    type        FooType

    userFolders UserFolder[]

    @@delegate(type)
    @@allow('all', true)
}

model Bar extends Foo {
    name String
}

model Baz extends Foo {
    age Int
}

model UserFolder {
    id     String @id @default(cuid())
    userId String
    fooId  String

    user   User   @relation(fields: [userId], references: [id])
    foo    Foo    @relation(fields: [fooId], references: [id])

    @@unique([userId, fooId])
    @@allow('all', true)
}
            `,
            {
                fullZod: true,
                provider: 'postgresql',
                dbUrl,
            }
        );
        // Ensure Zod Schemas don't include the delegate fields
        expect(
            zodSchemas.objects.UserFolderWhereUniqueInputObjectSchema.safeParse({
                userId_delegate_aux_UserFolder_fooId_Bar: {
                    userId: '1',
                    fooId: '2',
                },
            }).success
        ).toBeFalsy();

        expect(
            zodSchemas.objects.UserFolderWhereUniqueInputObjectSchema.safeParse({
                userId_delegate_aux_UserFolder_fooId_Baz: {
                    userId: '1',
                    fooId: '2',
                },
            }).success
        ).toBeFalsy();

        // Ensure we can query by the CompoundUniqueInput
        const db = enhance();
        const user = await db.user.create({ data: {} });
        const bar = await db.bar.create({ data: { name: 'bar' } });
        const baz = await db.baz.create({ data: { age: 1 } });

        const userFolderA = await db.userFolder.create({
            data: {
                userId: user.id,
                fooId: bar.id,
            },
        });

        const userFolderB = await db.userFolder.create({
            data: {
                userId: user.id,
                fooId: baz.id,
            },
        });

        await expect(
            db.userFolder.findUnique({
                where: {
                    userId_fooId: {
                        userId: user.id,
                        fooId: bar.id,
                    },
                },
            })
        ).resolves.toMatchObject(userFolderA);

        await expect(
            db.userFolder.findUnique({
                where: {
                    userId_fooId: {
                        userId: user.id,
                        fooId: baz.id,
                    },
                },
            })
        ).resolves.toMatchObject(userFolderB);
    });
});
