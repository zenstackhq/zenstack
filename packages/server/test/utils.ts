import superjson from 'superjson';

export const schema = `
model User {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique @email
    posts Post[]

    @@allow('all', auth() == this)
    @@allow('create,read', true)
}

model Post {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    publishedAt DateTime?
    viewCount Int @default(0)

    @@allow('all', author == auth())
    @@allow('read', published)
}
`;

export function makeUrl(path: string, data?: object, useSuperJson = false) {
    return data
        ? `${path}?data=${encodeURIComponent(useSuperJson ? superjson.stringify(data) : JSON.stringify(data))}`
        : path;
}
