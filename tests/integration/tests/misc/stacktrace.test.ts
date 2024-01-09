import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('Stack trace tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('stack trace', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id String @id @default(uuid())
        }
        `
        );

        const db = enhance();
        let error: Error | undefined = undefined;

        try {
            await db.model.create({ data: {} });
        } catch (err) {
            error = err as Error;
        }

        expect(error?.stack).toContain(
            "Error calling enhanced Prisma method `create`: denied by policy: model entities failed 'create' check"
        );
        expect(error?.stack).toContain(`misc/stacktrace.test.ts`);
        expect((error as any).internalStack).toBeTruthy();
    });
});
