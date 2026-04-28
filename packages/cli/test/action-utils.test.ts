import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateTempPrismaSchema } from '../src/actions/action-utils';
import { createProject } from './utils';

const model = `
model User {
    id String @id @default(cuid())
}
`;

describe('generateTempPrismaSchema', () => {
    it('defaults to a deterministic "~schema.prisma" filename', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        const schemaPath = path.join(workDir, 'zenstack/schema.zmodel');

        const generated = await generateTempPrismaSchema(schemaPath);

        try {
            expect(path.basename(generated)).toBe('~schema.prisma');
            expect(fs.existsSync(generated)).toBe(true);
        } finally {
            if (fs.existsSync(generated)) {
                fs.unlinkSync(generated);
            }
        }
    });

    it('appends a random UUID segment when randomName is true', async () => {
        const { workDir } = await createProject(model, { provider: 'sqlite' });
        const schemaPath = path.join(workDir, 'zenstack/schema.zmodel');

        const first = await generateTempPrismaSchema(schemaPath, { randomName: true });
        const second = await generateTempPrismaSchema(schemaPath, { randomName: true });

        try {
            const uuidPattern = /^~schema\.[0-9a-f-]{36}\.prisma$/;
            expect(path.basename(first)).toMatch(uuidPattern);
            expect(path.basename(second)).toMatch(uuidPattern);
            expect(first).not.toBe(second);
            expect(fs.existsSync(first)).toBe(true);
            expect(fs.existsSync(second)).toBe(true);
        } finally {
            for (const f of [first, second]) {
                if (fs.existsSync(f)) {
                    fs.unlinkSync(f);
                }
            }
        }
    });
});
