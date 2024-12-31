import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1930', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
model Organization {
  id       String   @id @default(cuid())
  entities Entity[]

  @@allow('all', true)
}

model Entity {
  id         String          @id @default(cuid())
  org        Organization?   @relation(fields: [orgId], references: [id])
  orgId      String?
  contents   EntityContent[]
  entityType String
  isDeleted  Boolean         @default(false)

  @@delegate(entityType)

  @@allow('all', !isDeleted)
}

model EntityContent {
  id                String @id @default(cuid())
  entity            Entity @relation(fields: [entityId], references: [id])
  entityId          String

  entityContentType String

  @@delegate(entityContentType)

  @@allow('create', true)
  @@allow('read', check(entity))
}

model Article extends Entity {
  private Boolean @default(false)
  @@deny('all', private)
}

model ArticleContent extends EntityContent {
  body String?
}   

model OtherContent extends EntityContent {
  data Int
}
        `
        );

        const fullDb = enhance(undefined, { kinds: ['delegate'] });
        const org = await fullDb.organization.create({ data: {} });
        const article = await fullDb.article.create({
            data: { org: { connect: { id: org.id } } },
        });

        const db = enhance();

        // normal create/read
        await expect(
            db.articleContent.create({
                data: { body: 'abc', entity: { connect: { id: article.id } } },
            })
        ).toResolveTruthy();
        await expect(db.article.findFirst({ include: { contents: true } })).resolves.toMatchObject({
            contents: expect.arrayContaining([expect.objectContaining({ body: 'abc' })]),
        });

        // deleted article's contents are not readable
        const deletedArticle = await fullDb.article.create({
            data: { org: { connect: { id: org.id } }, isDeleted: true },
        });
        const content1 = await fullDb.articleContent.create({
            data: { body: 'bcd', entity: { connect: { id: deletedArticle.id } } },
        });
        await expect(db.articleContent.findUnique({ where: { id: content1.id } })).toResolveNull();

        // private article's contents are not readable
        const privateArticle = await fullDb.article.create({
            data: { org: { connect: { id: org.id } }, private: true },
        });
        const content2 = await fullDb.articleContent.create({
            data: { body: 'cde', entity: { connect: { id: privateArticle.id } } },
        });
        await expect(db.articleContent.findUnique({ where: { id: content2.id } })).toResolveNull();
    });
});
