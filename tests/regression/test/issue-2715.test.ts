import { QueryUtils } from '@zenstackhq/orm';
import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2715
// Resolving an implicit many-to-many join table is a pure function of (schema, tableName),
// but it used to re-scan the entire schema on every call, for every table in every query.
// The resolution is now memoized per (immutable) schema. These tests guard that the
// memoization holds (so the per-query full-schema scan cannot silently regress) and that
// the resolved endpoints are correct across the shapes implicit m2m relations can take:
// plain two-model, self-relation, explicit @relation name, and multiple relations at once.
describe('Regression for issue #2715', () => {
    it('resolves implicit m2m join tables correctly and caches each per schema', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id     Int     @id @default(autoincrement())
    groups Group[]
    @@allow('all', true)
}

model Group {
    id    Int    @id @default(autoincrement())
    users User[]
    @@allow('all', true)
}

// self-relation m2m with an explicit join-table name
model Person {
    id        Int      @id @default(autoincrement())
    following Person[] @relation('follows')
    followers Person[] @relation('follows')
    @@allow('all', true)
}
            `,
        );

        const schema = db.$schema;

        // plain two-model m2m: join table follows Prisma's `_<A>To<B>` (sorted) convention,
        // endpoints come from the first declared side (User.groups), other side is Group.users
        const groupToUser = QueryUtils.getManyToManyJoinTable(schema, '_GroupToUser');
        expect(groupToUser).toEqual({
            model: 'User',
            field: 'groups',
            otherModel: 'Group',
            otherField: 'users',
        });

        // self-relation m2m with explicit name: join table is `_<name>`, both endpoints are
        // the same model, fields are the two relation fields (first declared side first)
        const follows = QueryUtils.getManyToManyJoinTable(schema, '_follows');
        expect(follows).toEqual({
            model: 'Person',
            field: 'following',
            otherModel: 'Person',
            otherField: 'followers',
        });

        // memoized: repeated resolution returns the SAME object reference (the index is built
        // once and reused). An un-memoized re-scan would construct a fresh descriptor each call,
        // so these `toBe`s are what fail if the per-query scan regresses.
        expect(QueryUtils.getManyToManyJoinTable(schema, '_GroupToUser')).toBe(groupToUser);
        expect(QueryUtils.getManyToManyJoinTable(schema, '_follows')).toBe(follows);

        // distinct relations are cached independently (no cross-contamination)
        expect(groupToUser).not.toBe(follows);

        // non-m2m table names and unknown tables resolve to undefined (negative results are
        // part of the cached index, not an uncached miss)
        expect(QueryUtils.getManyToManyJoinTable(schema, 'User')).toBeUndefined();
        expect(QueryUtils.getManyToManyJoinTable(schema, '_DoesNotExist')).toBeUndefined();
    });
});
