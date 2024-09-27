import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1746', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
            generator client {
                provider = "prisma-client-js"
            }

            datasource db {
                provider = "sqlite"
                url      = "file:./dev.db"
            }

            plugin zod {
                provider = '@core/zod'
                mode = 'strip'
                preserveTsFiles = true
            }  

            model Submission {
                id                String    @id @default(uuid())
                title             String?
                userId            String?
                user              User?     @relation(fields: [userId], references: [id], name: "user")
                comments          Comment[] @relation("submission")
                @@allow("all", true)
            }

            model User {
                id               String       @id @default(uuid())
                name             String?
                submissions      Submission[] @relation("user")
                comments         Comment[]    @relation("user")
                @@allow("all", true)
            }

            model Comment {
                id           String     @id @default(uuid())
                content      String?
                userId       String
                user         User       @relation(fields: [userId], references: [id], name: "user")
                submissionId String
                submission   Submission @relation(fields: [submissionId], references: [id], name: "submission")
                @@allow("all", true)
            }
            `,
            { addPrelude: false }
        );

        const commentCreateInputSchema = zodSchemas.input.CommentInputSchema.create;

        // unchecked
        let parsed = commentCreateInputSchema.safeParse({
            data: {
                content: 'Comment',
                userId: '1',
                submissionId: '2',
                unknown: 'unknown',
            },
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.data.userId).toBe('1');
        expect(parsed.data.data.submissionId).toBe('2');
        expect(parsed.data.data.unknown).toBeUndefined();

        // checked
        parsed = commentCreateInputSchema.safeParse({
            data: {
                content: 'Comment',
                user: { connect: { id: '1' } },
                submission: { connect: { id: '2' } },
                unknown: 'unknown',
            },
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.data.user).toMatchObject({ connect: { id: '1' } });
        expect(parsed.data.data.submission).toMatchObject({ connect: { id: '2' } });
        expect(parsed.data.data.unknown).toBeUndefined();

        // mixed
        parsed = commentCreateInputSchema.safeParse({
            data: {
                content: 'Comment',
                userId: '1',
                submission: { connect: { id: '2' } },
                unknown: 'unknown',
            },
        });
        expect(parsed.success).toBe(false);

        // nested create schema: checked/unchecked/array union
        const commentCreateNestedMany = zodSchemas.objects.CommentCreateNestedManyWithoutSubmissionInputObjectSchema;

        // unchecked
        parsed = commentCreateNestedMany.safeParse({
            create: { userId: '1', content: 'Content', unknown: 'unknown' },
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.create.userId).toBe('1');
        expect(parsed.data.create.unknown).toBeUndefined();

        // empty array
        parsed = commentCreateNestedMany.safeParse({ create: [] });
        expect(parsed.success).toBe(true);
        expect(parsed.data.create).toHaveLength(0);

        // unchecked array
        parsed = commentCreateNestedMany.safeParse({
            create: [
                { userId: '1', content: 'Content1', unknown: 'unknown1' },
                { userId: '2', content: 'Content2', unknown: 'unknown2' },
            ],
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.create).toHaveLength(2);
        expect(parsed.data.create[0].userId).toBe('1');
        expect(parsed.data.create[0].unknown).toBeUndefined();

        // checked
        parsed = commentCreateNestedMany.safeParse({
            create: { user: { connect: { id: '1' } }, content: 'Content', unknown: 'unknown' },
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.create.user).toMatchObject({ connect: { id: '1' } });
        expect(parsed.data.create.unknown).toBeUndefined();

        // checked array
        parsed = commentCreateNestedMany.safeParse({
            create: [
                { user: { connect: { id: '1' } }, content: 'Content1', unknown: 'unknown1' },
                { user: { connect: { id: '2' } }, content: 'Content2', unknown: 'unknown2' },
            ],
        });
        expect(parsed.success).toBe(true);
        expect(parsed.data.create).toHaveLength(2);
        expect(parsed.data.create[0].user).toMatchObject({ connect: { id: '1' } });
        expect(parsed.data.create[0].unknown).toBeUndefined();

        // mixed
        parsed = commentCreateNestedMany.safeParse({
            create: [
                { user: { connect: { id: '1' } }, content: 'Content1', unknown: 'unknown1' },
                { userId: '1', content: 'Content2', unknown: 'unknown2' },
            ],
        });
        expect(parsed.success).toBe(false);
    });
});
