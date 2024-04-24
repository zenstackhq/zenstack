/// <reference types="@types/jest" />

import { loadSchema, normalizePath } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import tmp from 'tmp';

describe('SWR Plugin Tests', () => {
    let origDir: string;

    beforeAll(() => {
        origDir = process.cwd();
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    const sharedModel = `
model User {
    id String @id
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
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
}

model Foo {
    id String @id
    @@ignore
}
    `;

    it('run plugin', async () => {
        await loadSchema(
            `
plugin swr {
    provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
    output = '$projectRoot/hooks'
}

${sharedModel}
        `,
            {
                provider: 'postgresql',
                pushDb: false,
                extraDependencies: [
                    `${normalizePath(path.join(__dirname, '../dist'))}`,
                    'react@18.2.0',
                    '@types/react@18.2.0',
                    'swr@^2',
                ],
                compile: true,
            }
        );
    });

    it('clear output', async () => {
        const { name: projectDir } = tmp.dirSync();
        fs.mkdirSync(path.join(projectDir, 'swr'), { recursive: true });
        fs.writeFileSync(path.join(projectDir, 'swr', 'test.txt'), 'hello');

        await loadSchema(
            `
        plugin swr {
            provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
            output = '$projectRoot/swr'
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

        expect(fs.existsSync(path.join(projectDir, 'swr', 'test.txt'))).toBeFalsy();
    });

    it('existing output as file', async () => {
        const { name: projectDir } = tmp.dirSync();
        fs.writeFileSync(path.join(projectDir, 'swr'), 'hello');

        await expect(
            loadSchema(
                `
        plugin swr {
            provider = '${normalizePath(path.resolve(__dirname, '../dist'))}'
            output = '$projectRoot/swr'
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
