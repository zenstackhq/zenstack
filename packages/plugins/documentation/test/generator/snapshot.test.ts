import { describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

function stabilize(content: string): string {
    return content
        .replace(/zenstack-schema-[a-f0-9-]+\.zmodel/g, 'zenstack-schema-<UUID>.zmodel')
        .replace(/[^\s`"')]*[/\\]zenstack-schema-[^\s`"')]+\.zmodel/g, '<REDACTED>.zmodel')
        .replace(/\*\*Duration\*\* \| [\d.]+ ms/g, '**Duration** | <REDACTED> ms')
        .replace(/\*\*Generated\*\* \| \d{4}-\d{2}-\d{2}/g, '**Generated** | <REDACTED>')
        .replace(/Generated:\*\* \d{4}-\d{2}-\d{2}/g, 'Generated:** <REDACTED>');
}

describe('documentation plugin: snapshot', () => {
    it('snapshot: full representative schema output', async () => {
        const tmpDir = await generateFromSchema(`
            /// User roles in the system.
            enum Role {
                /// Administrator with full access
                ADMIN
                /// Standard user
                USER
            }

            /// Represents a registered user.
            model User {
                id    String @id @default(cuid())
                /// User's email address.
                email String @unique @email
                /// Display name shown in the UI.
                name  String
                role  Role
                posts Post[]

                @@allow('read', true)
                @@deny('delete', true)
                @@index([email])
                @@meta('doc:category', 'Identity')
                @@meta('doc:since', '1.0')
            }

            /// A blog post.
            model Post {
                id       String @id @default(cuid())
                /// The post title.
                title    String
                content  String?
                author   User   @relation(fields: [authorId], references: [id])
                authorId String

                @@meta('doc:category', 'Content')
            }
        `);

        const indexContent = stabilize(readDoc(tmpDir, 'index.md'));
        const userDoc = stabilize(readDoc(tmpDir, 'models', 'User.md'));
        const postDoc = stabilize(readDoc(tmpDir, 'models', 'Post.md'));
        const roleDoc = stabilize(readDoc(tmpDir, 'enums', 'Role.md'));
        const relDoc = stabilize(readDoc(tmpDir, 'relationships.md'));

        expect(indexContent).toMatchSnapshot('index.md');
        expect(userDoc).toMatchSnapshot('models/User.md');
        expect(postDoc).toMatchSnapshot('models/Post.md');
        expect(roleDoc).toMatchSnapshot('enums/Role.md');
        expect(relDoc).toMatchSnapshot('relationships.md');
    });
});
