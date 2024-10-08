/* eslint-disable */
import type { Prisma } from '@prisma/client';
import type { TRPCClientErrorLike, TRPCRequestOptions } from '@trpc/client';
import type { MaybeRefOrGetter, UnwrapRef } from 'vue';
import type { AsyncData, AsyncDataOptions } from 'nuxt/app';
import type { KeysOf, PickFrom } from './utils';
import type { AnyRouter } from '@trpc/server';

export interface ClientType<AppRouter extends AnyRouter, Context = AppRouter['_def']['_config']['$types']['ctx']> {
    aggregate: {

        query: <T extends Prisma.PostAggregateArgs>(input: Prisma.Subset<T, Prisma.PostAggregateArgs>) => Promise<Prisma.GetPostAggregateType<T>>;
        useQuery: <T extends Prisma.PostAggregateArgs, ResT = Prisma.GetPostAggregateType<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.Subset<T, Prisma.PostAggregateArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostAggregateArgs, ResT = Prisma.GetPostAggregateType<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.Subset<T, Prisma.PostAggregateArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    createMany: {

        mutate: <T extends Prisma.PostCreateManyArgs>(input?: Prisma.SelectSubset<T, Prisma.PostCreateManyArgs>) => Promise<Prisma.BatchPayload>;
        useMutation: <T extends Prisma.PostCreateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostCreateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input?: Prisma.SelectSubset<T, Prisma.PostCreateManyArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    create: {

        mutate: <T extends Prisma.PostCreateArgs>(input: Prisma.SelectSubset<T, Prisma.PostCreateArgs>) => Promise<Prisma.PostGetPayload<T>>;
        useMutation: <T extends Prisma.PostCreateArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostCreateArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.PostCreateArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    deleteMany: {

        mutate: <T extends Prisma.PostDeleteManyArgs>(input?: Prisma.SelectSubset<T, Prisma.PostDeleteManyArgs>) => Promise<Prisma.BatchPayload>;
        useMutation: <T extends Prisma.PostDeleteManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostDeleteManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input?: Prisma.SelectSubset<T, Prisma.PostDeleteManyArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    delete: {

        mutate: <T extends Prisma.PostDeleteArgs>(input: Prisma.SelectSubset<T, Prisma.PostDeleteArgs>) => Promise<Prisma.PostGetPayload<T>>;
        useMutation: <T extends Prisma.PostDeleteArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostDeleteArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.PostDeleteArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    findFirst: {

        query: <T extends Prisma.PostFindFirstArgs>(input?: Prisma.SelectSubset<T, Prisma.PostFindFirstArgs>) => Promise<Prisma.PostGetPayload<T> | null>;
        useQuery: <T extends Prisma.PostFindFirstArgs, ResT = Prisma.PostGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindFirstArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostFindFirstArgs, ResT = Prisma.PostGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindFirstArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findFirstOrThrow: {

        query: <T extends Prisma.PostFindFirstOrThrowArgs>(input?: Prisma.SelectSubset<T, Prisma.PostFindFirstOrThrowArgs>) => Promise<Prisma.PostGetPayload<T>>;
        useQuery: <T extends Prisma.PostFindFirstOrThrowArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindFirstOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostFindFirstOrThrowArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindFirstOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findMany: {

        query: <T extends Prisma.PostFindManyArgs>(input?: Prisma.SelectSubset<T, Prisma.PostFindManyArgs>) => Promise<Array<Prisma.PostGetPayload<T>>>;
        useQuery: <T extends Prisma.PostFindManyArgs, ResT = Array<Prisma.PostGetPayload<T>>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindManyArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostFindManyArgs, ResT = Array<Prisma.PostGetPayload<T>>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindManyArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findUnique: {

        query: <T extends Prisma.PostFindUniqueArgs>(input: Prisma.SelectSubset<T, Prisma.PostFindUniqueArgs>) => Promise<Prisma.PostGetPayload<T> | null>;
        useQuery: <T extends Prisma.PostFindUniqueArgs, ResT = Prisma.PostGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindUniqueArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostFindUniqueArgs, ResT = Prisma.PostGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindUniqueArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findUniqueOrThrow: {

        query: <T extends Prisma.PostFindUniqueOrThrowArgs>(input: Prisma.SelectSubset<T, Prisma.PostFindUniqueOrThrowArgs>) => Promise<Prisma.PostGetPayload<T>>;
        useQuery: <T extends Prisma.PostFindUniqueOrThrowArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindUniqueOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostFindUniqueOrThrowArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.PostFindUniqueOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    groupBy: {

        query: <T extends Prisma.PostGroupByArgs,
            HasSelectOrTake extends Prisma.Or<
                Prisma.Extends<'skip', Prisma.Keys<T>>,
                Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
            ? { orderBy: Prisma.PostGroupByArgs['orderBy'] }
            : { orderBy?: Prisma.PostGroupByArgs['orderBy'] },
            OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>,
            ByFields extends Prisma.MaybeTupleToUnion<T['by']>,
            ByValid extends Prisma.Has<ByFields, OrderFields>,
            HavingFields extends Prisma.GetHavingFields<T['having']>,
            HavingValid extends Prisma.Has<ByFields, HavingFields>,
            ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False,
            InputErrors extends ByEmpty extends Prisma.True
            ? `Error: "by" must not be empty.`
            : HavingValid extends Prisma.False
            ? {
                [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                : [
                    Error,
                    'Field ',
                    P,
                    ` in "having" needs to be provided in "by"`,
                ]
            }[HavingFields]
            : 'take' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            : 'Error: If you provide "skip", you also need to provide "orderBy"'
            : ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        >(input: Prisma.SubsetIntersection<T, Prisma.PostGroupByArgs, OrderByArg> & InputErrors) => Promise<{} extends InputErrors ? Prisma.GetPostGroupByPayload<T> : InputErrors>;
        useQuery: <T extends Prisma.PostGroupByArgs,
            HasSelectOrTake extends Prisma.Or<
                Prisma.Extends<'skip', Prisma.Keys<T>>,
                Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
            ? { orderBy: Prisma.PostGroupByArgs['orderBy'] }
            : { orderBy?: Prisma.PostGroupByArgs['orderBy'] },
            OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>,
            ByFields extends Prisma.MaybeTupleToUnion<T['by']>,
            ByValid extends Prisma.Has<ByFields, OrderFields>,
            HavingFields extends Prisma.GetHavingFields<T['having']>,
            HavingValid extends Prisma.Has<ByFields, HavingFields>,
            ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False,
            InputErrors extends ByEmpty extends Prisma.True
            ? `Error: "by" must not be empty.`
            : HavingValid extends Prisma.False
            ? {
                [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                : [
                    Error,
                    'Field ',
                    P,
                    ` in "having" needs to be provided in "by"`,
                ]
            }[HavingFields]
            : 'take' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            : 'Error: If you provide "skip", you also need to provide "orderBy"'
            : ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            , ResT = {} extends InputErrors ? Prisma.GetPostGroupByPayload<T> : InputErrors, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SubsetIntersection<T, Prisma.PostGroupByArgs, OrderByArg> & InputErrors>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostGroupByArgs,
            HasSelectOrTake extends Prisma.Or<
                Prisma.Extends<'skip', Prisma.Keys<T>>,
                Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
            ? { orderBy: Prisma.PostGroupByArgs['orderBy'] }
            : { orderBy?: Prisma.PostGroupByArgs['orderBy'] },
            OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>,
            ByFields extends Prisma.MaybeTupleToUnion<T['by']>,
            ByValid extends Prisma.Has<ByFields, OrderFields>,
            HavingFields extends Prisma.GetHavingFields<T['having']>,
            HavingValid extends Prisma.Has<ByFields, HavingFields>,
            ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False,
            InputErrors extends ByEmpty extends Prisma.True
            ? `Error: "by" must not be empty.`
            : HavingValid extends Prisma.False
            ? {
                [P in HavingFields]: P extends ByFields
                ? never
                : P extends string
                ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
                : [
                    Error,
                    'Field ',
                    P,
                    ` in "having" needs to be provided in "by"`,
                ]
            }[HavingFields]
            : 'take' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            : 'Error: If you provide "take", you also need to provide "orderBy"'
            : 'skip' extends Prisma.Keys<T>
            ? 'orderBy' extends Prisma.Keys<T>
            ? ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            : 'Error: If you provide "skip", you also need to provide "orderBy"'
            : ByValid extends Prisma.True
            ? {}
            : {
                [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
            , ResT = {} extends InputErrors ? Prisma.GetPostGroupByPayload<T> : InputErrors, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SubsetIntersection<T, Prisma.PostGroupByArgs, OrderByArg> & InputErrors>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    updateMany: {

        mutate: <T extends Prisma.PostUpdateManyArgs>(input: Prisma.SelectSubset<T, Prisma.PostUpdateManyArgs>) => Promise<Prisma.BatchPayload>;
        useMutation: <T extends Prisma.PostUpdateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostUpdateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.PostUpdateManyArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    update: {

        mutate: <T extends Prisma.PostUpdateArgs>(input: Prisma.SelectSubset<T, Prisma.PostUpdateArgs>) => Promise<Prisma.PostGetPayload<T>>;
        useMutation: <T extends Prisma.PostUpdateArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostUpdateArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.PostUpdateArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    upsert: {

        mutate: <T extends Prisma.PostUpsertArgs>(input: Prisma.SelectSubset<T, Prisma.PostUpsertArgs>) => Promise<Prisma.PostGetPayload<T>>;
        useMutation: <T extends Prisma.PostUpsertArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.PostUpsertArgs, ResT = Prisma.PostGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.PostUpsertArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    count: {

        query: <T extends Prisma.PostCountArgs>(input?: Prisma.Subset<T, Prisma.PostCountArgs>) => Promise<'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.PostCountAggregateOutputType>
            : number>;
        useQuery: <T extends Prisma.PostCountArgs, ResT = 'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.PostCountAggregateOutputType>
            : number, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.Subset<T, Prisma.PostCountArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.PostCountArgs, ResT = 'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.PostCountAggregateOutputType>
            : number, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.Subset<T, Prisma.PostCountArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
}
