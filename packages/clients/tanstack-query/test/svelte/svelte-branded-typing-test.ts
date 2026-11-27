import type { TypeDefResult } from '@zenstackhq/orm';
import { expectTypeOf } from 'vitest';
import { useClientQueries } from '../../src/svelte/index.svelte';
import { schema } from '../schemas/branded/schema-lite';

type Schema = typeof schema;
type UserId = TypeDefResult<Schema, 'UserId'>;
type PostId = TypeDefResult<Schema, 'PostId'>;
type Email = TypeDefResult<Schema, 'Email'>;
type Age = TypeDefResult<Schema, 'Age'>;

const client = useClientQueries(schema);

const user = client.user.useFindUnique(() => ({ where: { id: 'user_1' as UserId }, include: { posts: true } })).data;
expectTypeOf(user!.id).toEqualTypeOf<UserId>();
expectTypeOf(user!.email).toEqualTypeOf<Email>();
expectTypeOf(user!.age).toEqualTypeOf<Age | null>();
expectTypeOf(user!.posts[0]!.id).toEqualTypeOf<PostId>();
expectTypeOf(user!.posts[0]!.authorId).toEqualTypeOf<UserId>();

// value filters require branded values, substring filters don't
expectTypeOf(
    client.user.useFindMany(() => ({ where: { id: { startsWith: 'user_' }, age: { gte: 18 as Age } } })).data![0]!.id,
).toEqualTypeOf<UserId>();

// @ts-expect-error plain strings are not branded
client.user.useFindMany(() => ({ where: { id: 'user_1' } }));

// @ts-expect-error plain numbers are not branded
client.user.useFindMany(() => ({ where: { age: { gte: 18 } } }));

expectTypeOf(client.$procs.getUserEmail.useQuery(() => ({ args: { id: 'user_1' as UserId } })).data).toEqualTypeOf<
    Email | undefined
>();

// @ts-expect-error plain strings are not branded
client.user.useFindUnique(() => ({ where: { id: 'user_1' } }));

// @ts-expect-error plain strings are not branded
client.user.useCreate().mutate({ data: { id: 'user_1', email: 'u1@test.com' } });

// @ts-expect-error a UserId is not a PostId
client.post.useDelete().mutate({ where: { id: 'post_1' as UserId } });

// @ts-expect-error plain numbers are not branded
client.$procs.setUserAge.useMutation().mutate({ args: { id: 'user_1' as UserId, age: 30 } });
