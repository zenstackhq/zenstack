export const schema = `
model User {
    id String @id @default(cuid())
    email String @unique
    posts Post[]
}

model Post {
    id String @id @default(cuid())
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
}
`;

export function makeUrl(path: string, q?: object) {
    return q ? `${path}?q=${encodeURIComponent(JSON.stringify(q))}` : path;
}
