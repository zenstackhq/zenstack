import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #586', () => {
    it('does not throw cannot-read-back for json array update with extra mutation plugin', async () => {
        const schema = `

        type AuthInfo {
            aProperty Boolean

            @@auth
        }

        type Foo {
            bar String
            baz Int

            @@allow("all", auth().aProperty)
        }

        model JsonArrayRoot {
            id String @id @default(cuid())

            fields JsonArrayField[]

            @@allow("all", auth().aProperty)
        }

        model JsonArrayField {
          id String @id @default(cuid())
          data Foo[] @json
          rootId String

          root JsonArrayRoot @relation(fields: [rootId], references: [id])

          @@allow("all", auth().aProperty)
        }
        `;

        const db = await createPolicyTestClient(schema, {
            provider: 'postgresql',
            usePrismaPush: true,
            plugins: [
                {
                    id: 'foo',
                    name: 'foo',
                    description: 'foo',
                    onEntityMutation: {
                        $all: {
                            afterEntityMutation: async () => Promise.resolve(),
                            beforeEntityMutation: async () => Promise.resolve(),
                            runAfterMutationWithinTransaction: true,
                        },
                    },
                },
            ],
        });

        try {
            const authed = db.$setAuth({ aProperty: true });

            const root = await authed.jsonArrayRoot.create({ data: {} });

            const created = await authed.jsonArrayField.create({
                data: {
                    data: [],
                    rootId: root.id,
                },
            });

            const updateData = [
                { bar: 'hello', baz: 1 },
                { bar: 'world', baz: 2 },
            ];

            await expect(
                authed.jsonArrayField.update({
                    where: { id: created.id },
                    data: {
                        data: updateData,
                        rootId: root.id,
                    },
                }),
            ).resolves.toMatchObject({ data: updateData });
        } finally {
            await db.$disconnect?.();
        }
    });
});
