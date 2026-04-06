import { useClientQueries } from '../src/vue';
import { schema } from './schemas/basic/schema-lite';
import { schema as proceduresSchema } from './schemas/procedures/schema-lite';

const client = useClientQueries(schema);
const proceduresClient = useClientQueries(proceduresSchema);

// @ts-expect-error missing args
client.user.useFindUnique();

check(client.user.useFindUnique({ where: { id: '1' } }).data.value?.email);
check(client.user.useFindUnique({ where: { id: '1' } }).queryKey);
check(client.user.useFindUnique({ where: { id: '1' } }, { optimisticUpdate: true, enabled: false }));

// @ts-expect-error unselected field
check(client.user.useFindUnique({ select: { email: true } }).data.name);

check(client.user.useFindUnique({ where: { id: '1' }, include: { posts: true } }).data.value?.posts[0]?.title);

check(client.user.useFindFirst().data.value?.email);
check(client.user.useFindFirst().data.value?.$optimistic);

check(client.user.useExists().data.value);
check(client.user.useExists({ where: { id: '1' } }).data.value);

check(client.user.useFindMany().data.value?.[0]?.email);
check(client.user.useFindMany().data.value?.[0]?.$optimistic);

check(client.user.useInfiniteFindMany().data.value?.pages[0]?.[0]?.email);
check(
    client.user.useInfiniteFindMany(
        {},
        {
            getNextPageParam: () => ({ id: '2' }),
        },
    ).data.value?.pages[1]?.[0]?.email,
);
// @ts-expect-error
check(client.user.useInfiniteFindMany().data.value?.pages[0]?.[0]?.$optimistic);

// TPageParam should be inferred from getNextPageParam, not typed as unknown
const infiniteResult = client.user.useInfiniteFindMany(
    {},
    {
        getNextPageParam: (_lastPage: unknown, _allPages: unknown, lastPageParam: { cursor: string }) => lastPageParam,
    },
);
check(infiniteResult.data.value?.pageParams[0]?.cursor);

check(client.user.useCount().data.value?.toFixed(2));
check(client.user.useCount({ select: { email: true } }).data.value?.email.toFixed(2));

check(client.user.useAggregate({ _max: { email: true } }).data.value?._max.email);

check(client.user.useGroupBy({ by: ['email'], _max: { name: true } }).data.value?.[0]?._max.name);

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

client.user
    .useUpsert()
    .mutate({ where: { id: '1' }, create: { email: 'new@example.com' }, update: { email: 'updated@example.com' } });

client.user.useDelete().mutate({ where: { id: '1' }, include: { posts: true } });

client.user.useDeleteMany().mutate({ where: { email: 'test@example.com' } });

function check(_value: unknown) {
    // noop
}

// @ts-expect-error delegate model
client.foo.useCreate();

client.foo.useUpdate();
client.bar.useCreate();

// procedures (query)
check(proceduresClient.$procs.greet.useQuery().data.value?.toUpperCase());
check(proceduresClient.$procs.greet.useQuery({ args: { name: 'bob' } }).data.value?.toUpperCase());
check(proceduresClient.$procs.greet.useQuery({ args: { name: 'bob' } }).queryKey.value);

//   Infinite queries for procedures are currently disabled, will add back later if needed
// check(
//     proceduresClient.$procs.greetMany.useInfiniteQuery({ args: { name: 'bob' } }).data.value?.pages[0]?.[0]?.toUpperCase(),
// );
// check(proceduresClient.$procs.greetMany.useInfiniteQuery({ args: { name: 'bob' } }).queryKey.value);

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
