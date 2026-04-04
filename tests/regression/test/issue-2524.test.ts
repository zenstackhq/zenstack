import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2524
describe('Regression for issue #2524', () => {
    it('should not exceed PostgreSQL 100-argument limit when including a relation with 51+ columns', async () => {
        // jsonb_build_object takes key-value pairs, so 51 columns = 102 arguments,
        // exceeding PostgreSQL's FUNC_MAX_ARGS limit of 100 (error code 54023)
        const db = await createTestClient(
            `
model Post {
    id           String        @id @default(cuid())
    opportunities Opportunity[]
}

model Opportunity {
    id     String  @id @default(cuid())
    postId String
    post   Post    @relation(fields: [postId], references: [id])
    col01  String  @default("")
    col02  String  @default("")
    col03  String  @default("")
    col04  String  @default("")
    col05  String  @default("")
    col06  String  @default("")
    col07  String  @default("")
    col08  String  @default("")
    col09  String  @default("")
    col10  String  @default("")
    col11  String  @default("")
    col12  String  @default("")
    col13  String  @default("")
    col14  String  @default("")
    col15  String  @default("")
    col16  String  @default("")
    col17  String  @default("")
    col18  String  @default("")
    col19  String  @default("")
    col20  String  @default("")
    col21  String  @default("")
    col22  String  @default("")
    col23  String  @default("")
    col24  String  @default("")
    col25  String  @default("")
    col26  String  @default("")
    col27  String  @default("")
    col28  String  @default("")
    col29  String  @default("")
    col30  String  @default("")
    col31  String  @default("")
    col32  String  @default("")
    col33  String  @default("")
    col34  String  @default("")
    col35  String  @default("")
    col36  String  @default("")
    col37  String  @default("")
    col38  String  @default("")
    col39  String  @default("")
    col40  String  @default("")
    col41  String  @default("")
    col42  String  @default("")
    col43  String  @default("")
    col44  String  @default("")
    col45  String  @default("")
    col46  String  @default("")
    col47  String  @default("")
    col48  String  @default("")
    col49  String  @default("")
    col50  String  @default("")
    col51  String  @default("")
}
            `,
            { usePrismaPush: true },
        );

        await db.post.create({
            data: {
                opportunities: {
                    create: [{}],
                },
            },
        });

        // This should not throw PostgreSQL error 54023:
        // "cannot pass more than 100 arguments to a function"
        const result = await db.post.findMany({
            include: { opportunities: true },
        });

        expect(result).toHaveLength(1);
        expect(result[0].opportunities).toHaveLength(1);
    });
});
