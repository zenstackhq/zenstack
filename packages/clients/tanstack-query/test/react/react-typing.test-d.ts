import type { ClientContract, ClientOptions } from '@zenstackhq/orm';
import { describe, it } from 'vitest';
import { useClientQueries } from '../../src/react';
import { schema } from '../schemas/basic/schema-lite';
import { schema as proceduresSchema } from '../schemas/procedures/schema-lite';

describe('React client typing test', () => {
    it('types model queries correctly', () => {
        const client = useClientQueries(schema);

        // @ts-expect-error missing args
        client.user.useFindUnique();

        check(client.user.useFindUnique({ where: { id: '1' } }).data?.email);
        check(client.user.useFindUnique({ where: { id: '1' } }).queryKey);
        check(client.user.useFindUnique({ where: { id: '1' } }, { optimisticUpdate: true, enabled: false }));

        // @ts-expect-error unselected field
        check(client.user.useFindUnique({ select: { email: true } }).data.name);

        check(client.user.useFindUnique({ where: { id: '1' }, include: { posts: true } }).data?.posts[0]?.title);

        check(client.user.useFindFirst().data?.email);
        check(client.user.useFindFirst().data?.$optimistic);

        check(client.user.useExists().data);
        check(client.user.useExists({ where: { id: '1' } }).data);

        check(client.user.useFindMany().data?.[0]?.email);
        check(client.user.useFindMany().data?.[0]?.$optimistic);

        check(client.user.useInfiniteFindMany().data?.pages[0]?.[0]?.email);
        check(
            client.user.useInfiniteFindMany(
                {},
                {
                    getNextPageParam: () => ({ id: '2' }),
                },
            ).data?.pages[1]?.[0]?.email,
        );

        // TPageParam should be inferred from getNextPageParam, not typed as unknown
        const infiniteResult = client.user.useInfiniteFindMany(
            {},
            {
                getNextPageParam: (_lastPage, _allPages, lastPageParam: { cursor: string }) => lastPageParam,
            },
        );
        check(infiniteResult.data?.pageParams[0]?.cursor);

        // @ts-expect-error
        check(client.user.useInfiniteFindMany().data?.pages[0]?.[0]?.$optimistic);

        check(client.user.useSuspenseFindMany().data[0]?.email);
        check(client.user.useSuspenseInfiniteFindMany().data.pages[0]?.[0]?.email);
        check(client.user.useCount().data?.toFixed(2));
        check(client.user.useCount({ select: { email: true } }).data?.email.toFixed(2));

        check(client.user.useAggregate({ _max: { email: true } }).data?._max.email);

        check(client.user.useGroupBy({ by: ['email'], _max: { name: true } }).data?.[0]?._max.name);

        // @ts-expect-error missing args
        client.user.useCreate().mutate();
        client.user.useCreate().mutate({ data: { email: 'test@example.com' } });
        client.user
            .useCreate({ optimisticUpdate: true, invalidateQueries: false, retry: 3 })
            .mutate({ data: { email: 'test@example.com' } });

        client.user
            .useCreate()
            .mutateAsync({ data: { email: 'test@example.com' }, include: { posts: true } })
            .then((d) => check(d.posts[0]?.title));

        client.user
            .useCreateMany()
            .mutateAsync({
                data: [{ email: 'test@example.com' }, { email: 'test2@example.com' }],
                skipDuplicates: true,
            })
            .then((d) => d.count);

        client.user
            .useCreateManyAndReturn()
            .mutateAsync({
                data: [{ email: 'test@example.com' }],
            })
            .then((d) => check(d[0]?.name));

        client.user
            .useCreateManyAndReturn()
            .mutateAsync({
                data: [{ email: 'test@example.com' }],
                select: { email: true },
            })
            // @ts-expect-error unselected field
            .then((d) => check(d[0].name));

        client.user.useUpdate().mutate(
            { data: { email: 'updated@example.com' }, where: { id: '1' } },
            {
                onSuccess: (d) => {
                    check(d.email);
                },
            },
        );

        client.user.useUpdateMany().mutate({ data: { email: 'updated@example.com' } });

        client.user
            .useUpdateManyAndReturn()
            .mutateAsync({ data: { email: 'updated@example.com' } })
            .then((d) => check(d[0]?.email));

        client.user.useUpsert().mutate({
            where: { id: '1' },
            create: { email: 'new@example.com' },
            update: { email: 'updated@example.com' },
        });

        client.user.useDelete().mutate({ where: { id: '1' }, include: { posts: true } });

        client.user.useDeleteMany().mutate({ where: { email: 'test@example.com' } });

        // @ts-expect-error delegate model
        client.foo.useCreate();

        client.foo.useUpdate();
        client.bar.useCreate();
    });

    it('reflects ExtQueryArgs and ExtResult inferred from a ClientContract type', () => {
        type DbType = ClientContract<
            typeof schema,
            ClientOptions<typeof schema>,
            // ExtQueryArgs: $read adds a `cache` filter to all read ops; $create adds a `bust` flag
            {
                $read: { cache?: { ttl?: number } };
                $create: { cache?: { bust?: boolean } };
            },
            // ExtClientMembers (unused here)
            {},
            // ExtResult: User gains a computed `displayName` field
            {
                user: {
                    displayName: {
                        needs: { email: true };
                        compute: (data: { email: string }) => string;
                    };
                };
            }
        >;

        const client = useClientQueries<DbType>(schema);

        // ExtQueryArgs $read flows into read ops
        check(client.user.useFindMany({ cache: { ttl: 1000 } }).data?.[0]?.email);
        check(client.user.useFindUnique({ where: { id: '1' }, cache: { ttl: 1000 } }).data?.email);
        check(client.user.useCount({ cache: { ttl: 1000 } }).data);

        // @ts-expect-error: $read's cache shape doesn't accept `bust`
        client.user.useFindMany({ cache: { bust: true } });

        // ExtQueryArgs $create flows into useCreate
        client.user.useCreate().mutate({ data: { email: 'a@b.com' }, cache: { bust: true } });

        // @ts-expect-error: $create's cache shape doesn't accept `ttl`
        client.user.useCreate().mutate({ data: { email: 'a@b.com' }, cache: { ttl: 1000 } });

        // ExtResult: `displayName` is added to User read results
        const findUniqueData = client.user.useFindUnique({ where: { id: '1' } }).data;
        check<string | undefined>(findUniqueData?.displayName);

        const findManyData = client.user.useFindMany().data;
        check<string | undefined>(findManyData?.[0]?.displayName);

        // ExtResult: `displayName` is also present on mutation return
        client.user
            .useCreate()
            .mutateAsync({ data: { email: 'a@b.com' } })
            .then((d) => check<string>(d.displayName));

        // Transaction: ExtQueryArgs flows through to operation args
        const tx = client.$transaction.useSequential();
        void async function () {
            const r = await tx.mutateAsync([
                { model: 'User', op: 'findMany', args: { cache: { ttl: 500 } } },
                { model: 'User', op: 'create', args: { data: { email: 'a@b.com' }, cache: { bust: true } } },
            ] as const);

            // ExtResult flows through to per-op transaction return
            check<string | undefined>(r[0][0]?.displayName);
            check<string>(r[1].displayName);
        };

        // @ts-expect-error: transaction args must respect ExtQueryArgs shape ($create has no ttl)
        tx.mutateAsync([{ model: 'User', op: 'create', args: { data: { email: 'a' }, cache: { ttl: 1 } } }] as const);
    });

    it('types procedure queries correctly', () => {
        const proceduresClient = useClientQueries(proceduresSchema);

        // procedures (query)
        check(proceduresClient.$procs.greet.useQuery().data?.toUpperCase());
        check(proceduresClient.$procs.greet.useQuery({ args: { name: 'bob' } }).data?.toUpperCase());
        check(proceduresClient.$procs.greet.useQuery({ args: { name: 'bob' } }, { enabled: true }).queryKey);
        // @ts-expect-error wrong arg shape
        proceduresClient.$procs.greet.useQuery({ args: { hello: 'world' } });

        //   Infinite queries for procedures are currently disabled, will add back later if needed
        // check(proceduresClient.$procs.greetMany.useInfiniteQuery({ args: { name: 'bob' } }).data?.pages[0]?.[0]?.toUpperCase());
        // check(proceduresClient.$procs.greetMany.useInfiniteQuery({ args: { name: 'bob' } }).queryKey);

        // @ts-expect-error missing args
        proceduresClient.$procs.greetMany.useQuery();
        // @ts-expect-error greet is not a mutation procedure
        proceduresClient.$procs.greet.useMutation();

        // procedures (mutation)
        proceduresClient.$procs.sum.useMutation().mutate({ args: { a: 1, b: 2 } });
        // @ts-expect-error wrong arg shape for multi-param procedure
        proceduresClient.$procs.sum.useMutation().mutate([1, 2]);
        proceduresClient.$procs.sum
            .useMutation()
            .mutateAsync({ args: { a: 1, b: 2 } })
            .then((d) => check(d.toFixed(2)));
    });
});

function check<T = unknown>(_value: T): T {
    return _value;
}
