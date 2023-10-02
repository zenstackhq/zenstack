/// <reference types="@types/jest" />

import { EmptyFileSystem } from 'langium';
import { expectFormatting } from 'langium/test';
import { createZModelServices } from '../../src/language-server/zmodel-module';
const services = createZModelServices({ ...EmptyFileSystem }).ZModel;
const formatting = expectFormatting(services);

describe('ZModelFormatter', () => {
    // eslint-disable-next-line jest/no-disabled-tests
    test.skip('declaration formatting', async () => {
        await formatting({
            before: `datasource db { provider = 'postgresql' url = env('DATABASE_URL')} generator js {provider = 'prisma-client-js'}
             plugin swrHooks {provider = '@zenstackhq/swr'output = 'lib/hooks'}             
             model User {id:id String @id name String? }
             enum Role {ADMIN USER}`,
            after: `datasource db {
    provider = 'postgresql'
    url = env('DATABASE_URL')
}
generator js {
    provider = 'prisma-client-js'
}
plugin swrHooks {
    provider = '@zenstackhq/swr'
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
