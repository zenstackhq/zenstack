import { EmptyFileSystem } from 'langium';
import { expectFormatting } from 'langium/test';
import { createZModelServices } from '../../src/language-server/zmodel-module';
const services = createZModelServices({ ...EmptyFileSystem }).ZModel;
const formatting = expectFormatting(services);

describe('ZModelFormatter', () => {
    it('declaration formatting', async () => {
        await formatting({
            before: `datasource db { provider = 'postgresql' url = env('DATABASE_URL')} generator js {provider = 'prisma-client-js'}
             plugin reactHooks {provider = '@zenstackhq/react'output = 'lib/hooks'}             
             model User {id:id String @id name String? }
             enum Role {ADMIN USER}`,
            after: `datasource db {
    provider = 'postgresql'
    url = env('DATABASE_URL')
}
generator js {
    provider = 'prisma-client-js'
}
plugin reactHooks {
    provider = '@zenstackhq/react'
    output = 'lib/hooks'
}
model User {
    id
    id String @id
    name String?
}
enum Role {
    ADMIN
    USER
}`,
        });
    });
});
