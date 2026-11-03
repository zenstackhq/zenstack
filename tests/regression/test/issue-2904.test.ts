import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2904
describe('Regression for issue 2904', () => {
    const schema = `
model User {
    id   Int   @id @default(autoincrement())
    bots Bot[]
}

model Bot {
    id        Int     @id @default(autoincrement())
    name      String
    useCase   String?
    modelName String?
    owner     User?   @relation(fields: [ownerId], references: [id])
    ownerId   Int?

    @@validate(useCase != null || modelName != null, 'needs a use case or a model')
}
`;

    it('accepts an update that sends none of the fields a rule references', async () => {
        const db = await createTestClient(schema);
        const user = await db.user.create({ data: {} });
        const bot = await db.bot.create({ data: { name: 'a', useCase: 'chat', ownerId: user.id } });

        await expect(db.bot.update({ where: { id: bot.id }, data: { name: 'b' } })).resolves.toMatchObject({
            name: 'b',
            useCase: 'chat',
        });
        await expect(db.bot.updateMany({ where: { id: bot.id }, data: { name: 'c' } })).resolves.toEqual({
            count: 1,
        });
        await expect(
            db.bot.upsert({
                where: { id: bot.id },
                create: { name: 'x', useCase: 'chat' },
                update: { name: 'd' },
            }),
        ).resolves.toMatchObject({ name: 'd' });
        await expect(
            db.user.update({
                where: { id: user.id },
                data: { bots: { update: { where: { id: bot.id }, data: { name: 'e' } } } },
                include: { bots: true },
            }),
        ).resolves.toMatchObject({ bots: [{ name: 'e' }] });
    });

    it('still checks a rule when the update sends a field it references', async () => {
        const db = await createTestClient(schema);
        const bot = await db.bot.create({ data: { name: 'a', useCase: 'chat' } });

        await expect(
            db.bot.update({ where: { id: bot.id }, data: { useCase: null, modelName: null } }),
        ).toBeRejectedByValidation(['needs a use case or a model']);
        await expect(
            db.bot.update({ where: { id: bot.id }, data: { useCase: null, modelName: 'gpt' } }),
        ).resolves.toMatchObject({ useCase: null, modelName: 'gpt' });
    });

    it('still checks every rule on create', async () => {
        const db = await createTestClient(schema);
        await expect(db.bot.create({ data: { name: 'a' } })).toBeRejectedByValidation(['needs a use case or a model']);
    });

    it('checks a rule when a relation field sets a foreign key the rule references', async () => {
        const db = await createTestClient(`
model User {
    id    Int    @id @default(autoincrement())
    posts Post[]
}

model Post {
    id       Int    @id @default(autoincrement())
    title    String
    author   User?  @relation(fields: [authorId], references: [id])
    authorId Int?

    @@validate(authorId != null, 'needs an author')
}
`);
        const user = await db.user.create({ data: {} });
        const post = await db.post.create({ data: { title: 'a', authorId: user.id } });

        await expect(db.post.update({ where: { id: post.id }, data: { title: 'b' } })).resolves.toMatchObject({
            title: 'b',
        });
        await expect(
            db.post.update({ where: { id: post.id }, data: { author: { disconnect: true } } }),
        ).toBeRejectedByValidation(['needs an author']);
    });

    it('checks a rule that references a field through this', async () => {
        const db = await createTestClient(`
model Item {
    id     Int    @id @default(autoincrement())
    name   String
    amount Int

    @@validate(this.amount > 0, 'amount must be positive')
}
`);
        const item = await db.item.create({ data: { name: 'a', amount: 1 } });

        await expect(db.item.update({ where: { id: item.id }, data: { name: 'b' } })).resolves.toMatchObject({
            name: 'b',
        });
        await expect(db.item.update({ where: { id: item.id }, data: { amount: -1 } })).toBeRejectedByValidation([
            'amount must be positive',
        ]);
    });
});
