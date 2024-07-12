/// <reference types="@types/jest" />

import { loadSchema, normalizePath } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import tmp from 'tmp';

describe('Tanstack Query Plugin Tests', () => {
    let origDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const sharedModel = `
model User {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique
    role role @default(USER)
    posts post_Item[]
}

enum role {
    USER
    ADMIN
}

model post_Item {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
}

model Foo {
    id String @id
    @@ignore
}
    `;

    const reactAppSource = {
        name: 'main.ts',
        content: `
        import { useFindFirstpost_Item, useInfiniteFindManypost_Item, useCreatepost_Item } from './hooks';

        function query() {
            const { data } = useFindFirstpost_Item({include: { author: true }}, { enabled: true, optimisticUpdate: false });
            console.log(data?.viewCount);
            console.log(data?.author?.email);
        }

        function infiniteQuery() {
            const { data, fetchNextPage, hasNextPage } = useInfiniteFindManypost_Item();
            useInfiniteFindManypost_Item({ where: { published: true } });
            useInfiniteFindManypost_Item(undefined, { enabled: true, getNextPageParam: () => null });
            console.log(data?.pages[0][0].published);
            console.log(data?.pageParams[0]);
        }

        async function mutation() {
            const { mutateAsync } = useCreatepost_Item();
            const data = await mutateAsync({ data: { title: 'hello' }, include: { author: true } });
            console.log(data?.viewCount);
            console.log(data?.author?.email);
        }
        `,
    };

    it('react-query run plugin v4', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'react'
    version = 'v4'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['react@18.2.0', '@types/react@18.2.0', '@tanstack/react-query@4.29.7'],
                copyDependencies: [path.resolve(__dirname, '../dist')],
                compile: true,
                extraSourceFiles: [reactAppSource],
            }
        );
    });

    it('react-query run plugin v5', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'react'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['react@18.2.0', '@types/react@18.2.0', '@tanstack/react-query@^5.0.0'],
                copyDependencies: [path.resolve(__dirname, '../dist')],
                compile: true,
                extraSourceFiles: [
                    reactAppSource,
                    {
                        name: 'suspense.ts',
                        content: `
                        import { useSuspenseInfiniteFindManypost_Item } from './hooks';

                        function suspenseInfiniteQuery() {
                            const { data, fetchNextPage, hasNextPage } = useSuspenseInfiniteFindManypost_Item();
                            useSuspenseInfiniteFindManypost_Item({ where: { published: true } });
                            useSuspenseInfiniteFindManypost_Item(undefined, { getNextPageParam: () => null });
                            console.log(data?.pages[0][0].published);
                            console.log(data?.pageParams[0]);
                        }
                        `,
                    },
                ],
            }
        );
    });

    const vueAppSource = {
        name: 'main.ts',
        content: `
        import { useFindFirstpost_Item, useInfiniteFindManypost_Item, useCreatepost_Item } from './hooks';

        function query() {
            const { data } = useFindFirstpost_Item({include: { author: true }}, { enabled: true, optimisticUpdate: false });
            console.log(data.value?.viewCount);
            console.log(data.value?.author?.email);
        }

        function infiniteQuery() {
            const { data, fetchNextPage, hasNextPage } = useInfiniteFindManypost_Item();
            useInfiniteFindManypost_Item({ where: { published: true } }, { enabled: true, getNextPageParam: () => null });
            useInfiniteFindManypost_Item(undefined, { getNextPageParam: () => null });
            console.log(data.value?.pages[0][0].published);
            console.log(data.value?.pageParams[0]);
        }

        async function mutation() {
            const { mutateAsync } = useCreatepost_Item();
            const data = await mutateAsync({ data: { title: 'hello' }, include: { author: true } });
            console.log(data?.viewCount);
            console.log(data?.author?.email);
        }
        `,
    };

    it('vue-query run plugin v4', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'vue'
    version = 'v4'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['vue@^3.3.4', '@tanstack/vue-query@4.37.0'],
                copyDependencies: [path.resolve(__dirname, '../dist')],
                compile: true,
                extraSourceFiles: [vueAppSource],
            }
        );
    });

    it('vue-query run plugin v5', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'vue'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['vue@^3.3.4', '@tanstack/vue-query@latest'],
                copyDependencies: [path.resolve(__dirname, '../dist')],
                compile: true,
                extraSourceFiles: [vueAppSource],
            }
        );
    });

    const svelteAppSource = {
        name: 'main.ts',
        content: `
        import { get } from 'svelte/store';
        import { useFindFirstpost_Item, useInfiniteFindManypost_Item, useCreatepost_Item } from './hooks';

        function query() {
            const { data } = get(useFindFirstpost_Item({include: { author: true }}, { enabled: true, optimisticUpdate: false }));
            console.log(data?.viewCount);
            console.log(data?.author?.email);
        }

        function infiniteQuery() {
            const { data, fetchNextPage, hasNextPage } = get(useInfiniteFindManypost_Item());
            useInfiniteFindManypost_Item({ where: { published: true } });
            useInfiniteFindManypost_Item(undefined, { enabled: true, getNextPageParam: () => null });
            console.log(data?.pages[0][0].published);
            console.log(data?.pageParams[0]);
        }

        async function mutation() {
            const { mutateAsync } = get(useCreatepost_Item());
            const data = await mutateAsync({ data: { title: 'hello' }, include: { author: true } });
            console.log(data?.viewCount);
            console.log(data?.author?.email);
        }
        `,
    };

    it('svelte-query run plugin v4', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'svelte'
    version = 'v4'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['svelte@^3.0.0', '@tanstack/svelte-query@4.29.7'],
                copyDependencies: [path.resolve(__dirname, '../dist')],
                compile: true,
                extraSourceFiles: [svelteAppSource],
            }
        );
    });

    it('svelte-query run plugin v5', async () => {
        await loadSchema(
            `
plugin tanstack {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
    target = 'svelte'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: ['svelte@^3.0.0', '@tanstack/svelte-query@^5.0.0'],
                copyDependencies: [path.resolve(__dirname, '../dist')],
                compile: true,
                extraSourceFiles: [svelteAppSource],
            }
        );
    });

    it('clear output', async () => {
        const { name: projectDir } = tmp.dirSync();
        fs.mkdirSync(path.join(projectDir, 'tanstack'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'tanstack', 'test.txt'), 'hello');

        await loadSchema(
            `
        plugin tanstack {
            provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
            output = '$projectRoot/tanstack'
            target = 'react'
        }
    
        model User {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
            email String @unique
            password String @omit
        }
        `,
            {
                pushDb: false,
                projectDir,
                extraDependencies: [`${normalizePath(path.join(__dirname, '../dist'))}`],
            }
        );

        expect(fs.existsSync(path.join(projectDir, 'tanstack', 'test.txt'))).toBeFalsy();
    });

    it('existing output as file', async () => {
        const { name: projectDir } = tmp.dirSync();
        fs.writeFileSync(path.join(projectDir, 'tanstack'), 'hello');

        await expect(
            loadSchema(
                `
        plugin tanstack {
            provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
            output = '$projectRoot/tanstack'
            target = 'react'
        }
    
        model User {
            id Int @id @default(autoincrement())
            createdAt DateTime @default(now())
            updatedAt DateTime @updatedAt
            email String
            password String @omit
        }        
        `,
                { pushDb: false, projectDir, extraDependencies: [`${normalizePath(path.join(__dirname, '../dist'))}`] }
            )
        ).rejects.toThrow('already exists and is not a directory');
    });
});
