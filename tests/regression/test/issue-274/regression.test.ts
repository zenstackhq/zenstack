import { createTestProject } from '@zenstackhq/testtools';
import { execSync } from 'child_process';
import { it } from 'vitest';

it('tests issue 274', async () => {
    const dir = await createTestProject(`

datasource db {
  provider = 'sqlite'
  url      = "file:./test.db"
}

model Comment {  
  id            String       @id
  author        User?     @relation(fields: [authorId], references: [id])
  authorId      String?   @default(auth().id) 
}

model User {
    id            String       @id
    email         String
    comments      Comment[]    
}
`);

    execSync('node node_modules/@zenstackhq/cli/dist/index.mjs migrate dev --name init', { cwd: dir });
});
