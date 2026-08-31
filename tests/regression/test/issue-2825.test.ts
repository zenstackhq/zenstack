import { createTestClient } from '@zenstackhq/testtools';
import { describe, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2825
describe('Regression for issue #2825', () => {
    it('handle same column name with enum type', async () => {
        const schema = `
enum UserStatus {
  OK1 @map("ok1")
  NO1 @map("no1")

  @@map("user_status")
}

enum PostStatus {
  OK2 @map("ok2")
  NO2 @map("no2")

  @@map("post_status")
}

model User {
  id     Int         @id @default(autoincrement())
  status UserStatus?
  posts  Post[]
}

model Post {
  id       Int         @id @default(autoincrement())
  status   PostStatus?
  author   User?       @relation(fields: [authorId], references: [id])
  authorId Int
}
`;

        const db = await createTestClient(schema, { usePrismaPush: true, provider: 'postgresql' });

        await db.$qb.selectFrom('User as u').innerJoin('Post as p', 'p.authorId', 'u.id').select('u.status').execute();
    });
});
