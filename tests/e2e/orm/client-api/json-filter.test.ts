import { AnyNull, DbNull, JsonNull } from '@zenstackhq/orm';
import { createTestClient, getTestDbProvider } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { schema } from '../schemas/json/schema';
import { schema as typedJsonSchema } from '../schemas/typed-json/schema';

describe('Json filter tests', () => {
    it('works with simple equality filter', async () => {
        const db = await createTestClient(schema);
        await expect(db.foo.create({ data: { data: { hello: 'world' } } })).resolves.toMatchObject({
            data: { hello: 'world' },
        });

        await expect(db.foo.findFirst({ where: { data: { equals: { hello: 'world' } } } })).resolves.toMatchObject({
            data: { hello: 'world' },
        });
        await expect(db.foo.findFirst({ where: { data: { not: { hello: 'foo' } } } })).resolves.toMatchObject({
            data: { hello: 'world' },
        });
        await expect(db.foo.findFirst({ where: { data: { not: { hello: 'world' } } } })).toResolveNull();
    });

    it('distinguishes between JsonNull and DbNull', async () => {
        const db = await createTestClient(schema);

        // Create records with different null types
        // Record 1: data contains JSON null, data1 is DB NULL (unset)
        const rec1 = await db.foo.create({ data: { data: JsonNull } });

        // Record 2: data contains object, data1 explicitly set to JSON null
        const rec2 = await db.foo.create({ data: { data: { foo: 'bar' }, data1: JsonNull } });

        // Record 3: data contains object, data1 is DB NULL (unset)
        const rec3 = await db.foo.create({ data: { data: { hello: 'world' }, data1: DbNull } });

        // Record 4: data contains object, data1 explicitly set to an object
        const rec4 = await db.foo.create({ data: { data: { test: 'value' }, data1: { key: 'value' } } });

        // Test JsonNull - should match JSON null value in data field
        const jsonNullResults = await db.foo.findMany({
            where: { data: { equals: JsonNull } },
        });
        expect(jsonNullResults).toHaveLength(1);
        expect(jsonNullResults[0]?.data).toBe(null); // JSON null is returned as null
        expect(jsonNullResults[0]?.id).toBe(rec1.id);

        // Test JsonNull in data1 field
        const jsonNullData1Results = await db.foo.findMany({
            where: { data1: { equals: JsonNull } },
        });
        expect(jsonNullData1Results).toHaveLength(1); // Only record 2 has data1 as JSON null
        expect(jsonNullData1Results[0]?.data1).toBe(null);
        expect(jsonNullData1Results[0]?.id).toBe(rec2.id);

        // Test NOT JsonNull - should exclude JSON null records
        const notJsonNull = await db.foo.findMany({
            where: { data: { not: JsonNull } },
        });
        expect(notJsonNull).toHaveLength(3); // Should exclude the JsonNull record
        expect(notJsonNull.map((r) => r.id).sort()).toEqual([rec2.id, rec3.id, rec4.id].sort());

        // Test data1 with actual value - "not JsonNull" should match DB NULL and actual objects
        const data1NotJsonNull = await db.foo.findMany({
            where: { data1: { not: JsonNull } },
        });
        // Records 1, 3 have DB NULL, record 4 has an object - all should match "not JsonNull"
        expect(data1NotJsonNull.length).toBe(3);

        // Test DbNull - should match database NULL values
        const dbNullResults = await db.foo.findMany({
            where: { data1: { equals: DbNull } },
        });
        // Records 1 and 3 have data1 as DB NULL
        expect(dbNullResults.length).toBe(2);
        expect(dbNullResults.map((r) => r.id).sort()).toEqual([rec1.id, rec3.id].sort());

        // Test AnyNull - should match both JSON null and DB NULL
        const anyNullResults = await db.foo.findMany({
            where: { data1: { equals: AnyNull } },
        });
        // Records 1, 2, and 3: rec1 (DB NULL), rec2 (JSON null), rec3 (DB NULL)
        expect(anyNullResults.length).toBe(3);
        expect(anyNullResults.map((r) => r.id).sort()).toEqual([rec1.id, rec2.id, rec3.id].sort());

        // invalid input
        // @ts-expect-error
        await expect(db.foo.create({ data: { data: null } })).toBeRejectedByValidation();
        // @ts-expect-error
        await expect(db.foo.create({ data: { data: DbNull } })).toBeRejectedByValidation();
        // @ts-expect-error
        await expect(db.foo.create({ data: { data1: null } })).toBeRejectedByValidation();
        // @ts-expect-error
        await expect(db.foo.update({ where: { id: rec1.id }, data: { data: null } })).toBeRejectedByValidation();
        await expect(
            // @ts-expect-error
            db.foo.update({ where: { id: rec1.id }, data: { data: DbNull } }),
        ).toBeRejectedByValidation();
        // @ts-expect-error
        await expect(db.foo.update({ where: { id: rec1.id }, data: { data1: null } })).toBeRejectedByValidation();
    });

    it('works with updates', async () => {
        const db = await createTestClient(schema);
        const rec = await db.foo.create({ data: { data: { hello: 'world' }, data1: 'data1' } });

        // Update to JSON null
        await db.foo.update({
            where: { id: rec.id },
            data: { data: JsonNull },
        });
        await expect(db.foo.findUnique({ where: { id: rec.id } })).resolves.toMatchObject({
            data: null,
        });

        // Update to DB null
        await db.foo.update({
            where: { id: rec.id },
            data: { data1: DbNull },
        });
        await expect(db.foo.findUnique({ where: { id: rec.id } })).resolves.toMatchObject({
            data1: null,
        });

        // Update to actual object
        await db.foo.update({
            where: { id: rec.id },
            data: { data: { updated: 'value' }, data1: { another: 'value' } },
        });
        await expect(db.foo.findUnique({ where: { id: rec.id } })).resolves.toMatchObject({
            data: { updated: 'value' },
            data1: { another: 'value' },
        });
    });

    it('works with JSON objects containing null values', async () => {
        const db = await createTestClient(schema);

        // Create a record with an object containing a null property value
        const rec1 = await db.foo.create({ data: { data: { key: null } } });
        expect(rec1.data).toEqual({ key: null });

        // Create a record with nested object containing null values
        const rec2 = await db.foo.create({ data: { data: { outer: { inner: null }, valid: 'value' } } });
        expect(rec2.data).toEqual({ outer: { inner: null }, valid: 'value' });

        // Query with equality filter for object with null value
        await expect(db.foo.findFirst({ where: { data: { equals: { key: null } } } })).resolves.toMatchObject({
            id: rec1.id,
            data: { key: null },
        });

        // Query with equality filter for nested object with null value
        await expect(
            db.foo.findFirst({ where: { data: { equals: { outer: { inner: null }, valid: 'value' } } } }),
        ).resolves.toMatchObject({
            id: rec2.id,
            data: { outer: { inner: null }, valid: 'value' },
        });

        // Query with not filter for object with null value
        const notResults = await db.foo.findMany({
            where: { data: { not: { key: null } } },
        });
        expect(notResults.find((r) => r.id === rec1.id)).toBeUndefined();
        expect(notResults.find((r) => r.id === rec2.id)).toBeDefined();
    });

    it('works with JSON arrays containing null values', async () => {
        const db = await createTestClient(schema);

        // Create a record with an array containing null values
        const rec1 = await db.foo.create({ data: { data: [1, null, 3] } });
        expect(rec1.data).toEqual([1, null, 3]);

        // Create a record with an array of objects including null
        const rec2 = await db.foo.create({ data: { data: [{ a: 1 }, null, { b: 2 }] } });
        expect(rec2.data).toEqual([{ a: 1 }, null, { b: 2 }]);

        // Create a record with nested arrays containing null
        const rec3 = await db.foo.create({
            data: {
                data: [
                    [1, null],
                    [null, 2],
                ],
            },
        });
        expect(rec3.data).toEqual([
            [1, null],
            [null, 2],
        ]);

        // Query with equality filter for array with null value
        await expect(db.foo.findFirst({ where: { data: { equals: [1, null, 3] } } })).resolves.toMatchObject({
            id: rec1.id,
            data: [1, null, 3],
        });

        // Query with equality filter for array of objects with null
        await expect(
            db.foo.findFirst({ where: { data: { equals: [{ a: 1 }, null, { b: 2 }] } } }),
        ).resolves.toMatchObject({
            id: rec2.id,
            data: [{ a: 1 }, null, { b: 2 }],
        });

        // Query with not filter for array with null value
        const notResults = await db.foo.findMany({
            where: { data: { not: [1, null, 3] } },
        });
        expect(notResults.find((r) => r.id === rec1.id)).toBeUndefined();
        expect(notResults.find((r) => r.id === rec2.id)).toBeDefined();
        expect(notResults.find((r) => r.id === rec3.id)).toBeDefined();
    });

    it('works with filtering typed JSON fields', async () => {
        const db = await createTestClient(typedJsonSchema);

        const alice = await db.user.create({
            data: { profile: { name: 'Alice', age: 25, jobs: [] } },
        });

        await expect(
            db.user.findFirst({ where: { profile: { equals: { name: 'Alice', age: 25, jobs: [] } } } }),
        ).resolves.toMatchObject(alice);

        await expect(db.user.findFirst({ where: { profile: { equals: { name: 'Alice', age: 20 } } } })).toResolveNull();
        await expect(
            db.user.findFirst({ where: { profile: { not: { name: 'Alice', age: 20 } } } }),
        ).resolves.toMatchObject(alice);
    });

    it('works with path selection equality filter', async () => {
        const db = await createTestClient(schema);
        const createData = { a: { b: { c: 42 } }, x: [{ value: 1 }, { value: 2 }] };
        await db.foo.create({
            data: { data: createData },
        });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        equals: createData,
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$',
                        equals: createData,
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: createData['a'],
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a.b',
                        equals: createData['a']['b'],
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a.z',
                        equals: createData['a']['b'],
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.x',
                        equals: createData['x'],
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.x[1]',
                        equals: createData['x'][1],
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.x[0]',
                        equals: createData['x'][1],
                    },
                },
            }),
        ).toResolveNull();

        // null filters for non-null value

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: JsonNull,
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: DbNull,
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: AnyNull,
                    },
                },
            }),
        ).toResolveNull();

        // null filters for null value
        await db.foo.deleteMany();

        await db.foo.create({
            data: { data: { a: null } },
        });

        // @ts-expect-error
        db.foo.findFirst({ where: { data: { path: '$.a', equals: null } } });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: JsonNull,
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: DbNull,
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.a',
                        equals: AnyNull,
                    },
                },
            }),
        ).toResolveTruthy();

        // null filters for top-level nulls
        await db.foo.deleteMany();
        await db.foo.create({
            data: { data: JsonNull },
        });
        await expect(db.foo.findFirst({ where: { data: { equals: JsonNull } } })).toResolveTruthy();
        await expect(db.foo.findFirst({ where: { data: { equals: DbNull } } })).toResolveNull();
        await expect(db.foo.findFirst({ where: { data: { equals: AnyNull } } })).toResolveTruthy();
        await expect(db.foo.findFirst({ where: { data: { path: '$.foo', equals: JsonNull } } })).toResolveNull();
        await expect(db.foo.findFirst({ where: { data: { path: '$.foo', equals: DbNull } } })).toResolveTruthy();
        await expect(db.foo.findFirst({ where: { data: { path: '$.foo', equals: AnyNull } } })).toResolveTruthy();

        // null filters for nulls in arrays
        await db.foo.deleteMany();
        await db.foo.create({ data: { data: { arr: [1, null] } } });
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[1]', equals: JsonNull },
                },
            }),
        ).toResolveTruthy();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[1]', equals: DbNull },
                },
            }),
        ).toResolveNull();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[1]', equals: AnyNull },
                },
            }),
        ).toResolveTruthy();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[0]', equals: JsonNull },
                },
            }),
        ).toResolveNull();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[0]', equals: DbNull },
                },
            }),
        ).toResolveFalsy();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[0]', equals: AnyNull },
                },
            }),
        ).toResolveFalsy();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[2]', equals: JsonNull },
                },
            }),
        ).toResolveNull();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[2]', equals: DbNull },
                },
            }),
        ).toResolveTruthy();
        await expect(
            db.foo.findFirst({
                where: {
                    data: { path: '$.arr[2]', equals: AnyNull },
                },
            }),
        ).toResolveTruthy();
    });

    it('works with path selection string filters', async () => {
        const db = await createTestClient(schema);

        await db.foo.create({
            data: { data: { name: 'John Doe', email: 'john@example.com', tags: ['developer', 'typescript'] } },
        });
        await db.foo.create({
            data: { data: { name: 'Jane Smith', email: 'jane@test.org', tags: ['designer', 'ui'] } },
        });
        await db.foo.create({
            data: { data: { name: 'Bob Johnson', email: 'bob@example.net', tags: ['manager', 'typescript'] } },
        });
        await db.foo.create({
            data: { data: { name: '%Foo', email: 'foo@example.com' } },
        });

        // string_contains
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_contains: 'Doe',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { name: 'John Doe' } });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_contains: '%Doe', // % should be treated as literal
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_contains: 'doe',
                        mode: 'insensitive', // case insensitive
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { name: 'John Doe' } });

        const provider = getTestDbProvider();
        if (provider === 'postgresql') {
            await expect(
                db.foo.findFirst({
                    where: {
                        data: {
                            path: '$.name',
                            string_contains: 'doe',
                        },
                    },
                }),
            ).toResolveNull(); // case sensitive

            await expect(
                db.foo.findFirst({
                    where: {
                        data: {
                            path: '$.name',
                            string_contains: 'doe',
                            mode: 'default',
                        },
                    },
                }),
            ).toResolveNull(); // case sensitive
        }

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.bar', // non-existing path
                        string_contains: 'Doe',
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_contains: 'NonExistent',
                    },
                },
            }),
        ).toResolveNull();

        // string_starts_with
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_starts_with: 'Jane',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { name: 'Jane Smith' } });
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_starts_with: '%Jane', // % should be treated as literal
                    },
                },
            }),
        ).toResolveNull();
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_starts_with: '%Smith', // % should be treated as literal
                    },
                },
            }),
        ).toResolveNull();
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_starts_with: '%Foo', // % should be treated as literal
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { name: '%Foo' } });

        // string_ends_with
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_ends_with: 'Johnson',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { name: 'Bob Johnson' } });
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.name',
                        string_ends_with: 'Johnson%',
                    },
                },
            }),
        ).toResolveNull();

        // Test with array index access
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags[0]',
                        string_contains: 'velop',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { tags: ['developer', 'typescript'] } });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags[1]',
                        string_starts_with: 'type',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { tags: ['developer', 'typescript'] } });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags[2]',
                        string_starts_with: 'type',
                    },
                },
            }),
        ).toResolveNull();
    });

    it('works with string filter for top-level string values', async () => {
        const db = await createTestClient(schema);

        await db.foo.createMany({
            data: [{ data: 'Hello World' }],
        });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        string_contains: 'World',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: 'Hello World' });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        string_contains: 'World',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: 'Hello World' });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        string_contains: 'Foo',
                    },
                },
            }),
        ).toResolveNull();
    });

    it('works with path selection array filter', async () => {
        const db = await createTestClient(schema);

        await db.foo.create({
            data: {
                data: {
                    tags: ['typescript', 'react', 'node'],
                    numbers: [1, 2, 3, 4, 5],
                    nested: { items: ['alpha', 'beta', 'gamma'] },
                },
            },
        });
        await db.foo.create({
            data: {
                data: {
                    tags: ['python', 'django', 'flask'],
                    numbers: [10, 20, 30],
                    nested: { items: ['delta', 'epsilon'] },
                },
            },
        });
        await db.foo.create({
            data: {
                data: {
                    tags: ['java', 'spring'],
                    numbers: [100, 200],
                    nested: { items: ['zeta'] },
                },
            },
        });

        // array_contains - check if array contains a specific value
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags',
                        array_contains: 'react',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { tags: ['typescript', 'react', 'node'] } });

        if ((db.$schema.provider.type as any) === 'postgresql') {
            await expect(
                db.foo.findFirst({
                    where: {
                        data: {
                            path: '$.tags',
                            array_contains: ['react'],
                        },
                    },
                }),
            ).resolves.toMatchObject({ data: { tags: ['typescript', 'react', 'node'] } });
        }

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.numbers',
                        array_contains: 20,
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { numbers: [10, 20, 30] } });

        // array_contains with nested path
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.nested.items',
                        array_contains: 'beta',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { nested: { items: ['alpha', 'beta', 'gamma'] } } });

        // array_starts_with - check if array starts with a specific value
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags',
                        array_starts_with: 'typescript',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { tags: ['typescript', 'react', 'node'] } });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.numbers',
                        array_starts_with: 1,
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { numbers: [1, 2, 3, 4, 5] } });

        // array_ends_with - check if array ends with a specific value
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags',
                        array_ends_with: 'node',
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { tags: ['typescript', 'react', 'node'] } });

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.numbers',
                        array_ends_with: 30,
                    },
                },
            }),
        ).resolves.toMatchObject({ data: { numbers: [10, 20, 30] } });

        // Negative tests - should not match
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags',
                        array_contains: 'rust',
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.tags',
                        array_starts_with: 'react',
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.numbers',
                        array_ends_with: 100,
                    },
                },
            }),
        ).toResolveNull();

        // Test with non-existent path
        await expect(
            db.foo.findFirst({
                where: {
                    data: {
                        path: '$.nonexistent',
                        array_contains: 'anything',
                    },
                },
            }),
        ).toResolveNull();
    });

    it('typed json direct filtering', async () => {
        const db = await createTestClient(typedJsonSchema);

        await db.user.create({
            data: {
                profile: {
                    name: 'Alice',
                    age: 25,
                    address: { country: 'US' },
                    jobs: [{ title: 'Developer' }, { title: 'Designer' }],
                },
            },
        });

        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        name: 'Alice',
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        age: {
                            lt: 20,
                        },
                    },
                },
            }),
        ).toResolveNull();

        // deep field
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        address: {
                            country: 'US',
                        },
                    },
                },
            }),
        ).toResolveTruthy();
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        is: {
                            address: {
                                country: 'US',
                            },
                        },
                    },
                },
            }),
        ).toResolveTruthy();
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        isNot: {
                            address: {
                                country: 'US',
                            },
                        },
                    },
                },
            }),
        ).toResolveNull();

        // mixed shallow and deep
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        name: 'Alice',
                        address: {
                            country: 'US',
                        },
                    },
                },
            }),
        ).toResolveTruthy();

        // nullable fields
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        name: 'Alice',
                        address: {
                            zip: null,
                        },
                    },
                },
            }),
        ).toResolveTruthy();

        // array of typed json
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        jobs: {
                            some: {
                                title: 'Designer',
                            },
                        },
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        jobs: {
                            every: {
                                title: 'Designer',
                            },
                        },
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        jobs: {
                            none: {
                                title: 'Designer',
                            },
                        },
                    },
                },
            }),
        ).toResolveNull();

        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        jobs: {
                            every: {
                                title: {
                                    startsWith: 'De',
                                },
                            },
                        },
                    },
                },
            }),
        ).toResolveTruthy();

        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        jobs: {
                            none: {
                                title: {
                                    startsWith: 'De',
                                },
                            },
                        },
                    },
                },
            }),
        ).toResolveFalsy();

        // mixed plain json and typed json
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        name: 'Alice',
                        // @ts-expect-error
                        path: '$.name',
                        // @ts-expect-error
                        equals: 'Alice',
                    },
                },
            }),
        ).toBeRejectedByValidation();

        await db.user.deleteMany();
        await db.user.create({
            data: {
                profile: {
                    name: 'Alice',
                    age: 25,
                    jobs: [],
                    address: null,
                },
            },
        });

        // null filter
        await expect(
            db.user.findFirst({
                where: {
                    profile: {
                        address: null,
                    },
                },
            }),
        ).toResolveTruthy();
    });
});
