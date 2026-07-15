import { afterEach, describe, expect, it, vi } from 'vitest';

// Script the readline answers the "user" types, consumed in order by the prompt.
const { answers } = vi.hoisted(() => ({ answers: { queue: [] as string[] } }));

vi.mock('node:readline', () => ({
    default: {
        createInterface: () => ({
            question: (_query: string, cb: (answer: string) => void) => cb(answers.queue.shift() ?? ''),
            close: () => {},
        }),
    },
}));

import { createInteractiveDataLossConfirmer, createInteractiveRenameResolver } from '../src/actions/rename-prompt';

/** Runs `fn` with both stdin/stdout reporting as a TTY, restoring the originals afterward. */
function withTTY<T>(fn: () => T): T {
    const inTTY = process.stdin.isTTY;
    const outTTY = process.stdout.isTTY;
    (process.stdin as any).isTTY = true;
    (process.stdout as any).isTTY = true;
    try {
        return fn();
    } finally {
        (process.stdin as any).isTTY = inTTY;
        (process.stdout as any).isTTY = outTTY;
    }
}

afterEach(() => {
    answers.queue = [];
});

describe('interactive rename resolver', () => {
    it('is disabled (undefined) without a TTY — safe for CI/non-interactive runs', () => {
        const inTTY = process.stdin.isTTY;
        const outTTY = process.stdout.isTTY;
        (process.stdin as any).isTTY = false;
        (process.stdout as any).isTTY = false;
        try {
            expect(createInteractiveRenameResolver()).toBeUndefined();
        } finally {
            (process.stdin as any).isTTY = inTTY;
            (process.stdout as any).isTTY = outTTY;
        }
    });

    it('is enabled with a TTY', () => {
        const resolver = withTTY(() => createInteractiveRenameResolver());
        expect(resolver).toBeDefined();
        expect(typeof resolver?.resolveTableRenames).toBe('function');
        expect(typeof resolver?.resolveColumnRenames).toBe('function');
    });

    it('records a chosen rename and treats the rest as fresh creates', async () => {
        // created "fullName" -> pick option 1 (rename from "name"); "nickname" has no source left
        answers.queue = ['1'];
        const resolver = withTTY(() => createInteractiveRenameResolver())!;
        const result = await resolver.resolveColumnRenames!({
            table: 'User',
            created: ['fullName', 'nickname'],
            deleted: ['name'],
        });
        expect(result).toEqual([{ from: 'name', to: 'fullName' }]);
    });

    it('honors "create new" (option 0) and does not consume the source', async () => {
        // "a" -> create new (0); "b" -> rename from the still-available "x" (1)
        answers.queue = ['0', '1'];
        const resolver = withTTY(() => createInteractiveRenameResolver())!;
        const result = await resolver.resolveTableRenames!({ created: ['a', 'b'], deleted: ['x'] });
        expect(result).toEqual([{ from: 'x', to: 'b' }]);
    });

    it('defaults empty input to "create new"', async () => {
        answers.queue = ['']; // just press enter
        const resolver = withTTY(() => createInteractiveRenameResolver())!;
        const result = await resolver.resolveColumnRenames!({
            table: 'User',
            created: ['fullName'],
            deleted: ['name'],
        });
        expect(result).toEqual([]);
    });
});

describe('interactive data-loss confirmer', () => {
    const warnings = ['column "User.name" will be dropped (its data will be lost)'];

    it('is disabled (undefined) without a TTY — safe for CI/non-interactive runs', () => {
        const inTTY = process.stdin.isTTY;
        const outTTY = process.stdout.isTTY;
        (process.stdin as any).isTTY = false;
        (process.stdout as any).isTTY = false;
        try {
            expect(createInteractiveDataLossConfirmer()).toBeUndefined();
        } finally {
            (process.stdin as any).isTTY = inTTY;
            (process.stdout as any).isTTY = outTTY;
        }
    });

    it('confirms on "y" (case-insensitive, "yes" accepted too)', async () => {
        answers.queue = ['y'];
        const confirm = withTTY(() => createInteractiveDataLossConfirmer())!;
        await expect(confirm(warnings)).resolves.toBe(true);

        answers.queue = ['YES'];
        await expect(confirm(warnings)).resolves.toBe(true);
    });

    it('declines on "n"', async () => {
        answers.queue = ['n'];
        const confirm = withTTY(() => createInteractiveDataLossConfirmer())!;
        await expect(confirm(warnings)).resolves.toBe(false);
    });

    it('defaults empty input to "no" (safe default)', async () => {
        answers.queue = ['']; // just press enter
        const confirm = withTTY(() => createInteractiveDataLossConfirmer())!;
        await expect(confirm(warnings)).resolves.toBe(false);
    });
});
