/* eslint-disable */
import type { Prisma } from '@prisma/client';
import type { TRPCClientErrorLike, TRPCRequestOptions } from '@trpc/client';
import type { MaybeRefOrGetter, UnwrapRef } from 'vue';
import type { AsyncData, AsyncDataOptions } from 'nuxt/app';
import type { KeysOf, PickFrom } from './utils';
import type { AnyTRPCRouter as AnyRouter } from '@trpc/server';

export interface ClientType<AppRouter extends AnyRouter, Context = AppRouter['_def']['_config']['$types']['ctx']> {
    aggregate: {

        query: <T extends Prisma.UserAggregateArgs>(input: Prisma.Subset<T, Prisma.UserAggregateArgs>) => Promise<Prisma.GetUserAggregateType<T>>;
        useQuery: <T extends Prisma.UserAggregateArgs, ResT = Prisma.GetUserAggregateType<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.Subset<T, Prisma.UserAggregateArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserAggregateArgs, ResT = Prisma.GetUserAggregateType<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.Subset<T, Prisma.UserAggregateArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    createMany: {

        mutate: <T extends Prisma.UserCreateManyArgs>(input?: Prisma.SelectSubset<T, Prisma.UserCreateManyArgs>) => Promise<Prisma.BatchPayload>;
        useMutation: <T extends Prisma.UserCreateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserCreateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input?: Prisma.SelectSubset<T, Prisma.UserCreateManyArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    create: {

        mutate: <T extends Prisma.UserCreateArgs>(input: Prisma.SelectSubset<T, Prisma.UserCreateArgs>) => Promise<Prisma.UserGetPayload<T>>;
        useMutation: <T extends Prisma.UserCreateArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserCreateArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.UserCreateArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    deleteMany: {

        mutate: <T extends Prisma.UserDeleteManyArgs>(input?: Prisma.SelectSubset<T, Prisma.UserDeleteManyArgs>) => Promise<Prisma.BatchPayload>;
        useMutation: <T extends Prisma.UserDeleteManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserDeleteManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input?: Prisma.SelectSubset<T, Prisma.UserDeleteManyArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    delete: {

        mutate: <T extends Prisma.UserDeleteArgs>(input: Prisma.SelectSubset<T, Prisma.UserDeleteArgs>) => Promise<Prisma.UserGetPayload<T>>;
        useMutation: <T extends Prisma.UserDeleteArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserDeleteArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.UserDeleteArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    findFirst: {

        query: <T extends Prisma.UserFindFirstArgs>(input?: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>) => Promise<Prisma.UserGetPayload<T> | null>;
        useQuery: <T extends Prisma.UserFindFirstArgs, ResT = Prisma.UserGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserFindFirstArgs, ResT = Prisma.UserGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findFirstOrThrow: {

        query: <T extends Prisma.UserFindFirstOrThrowArgs>(input?: Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>) => Promise<Prisma.UserGetPayload<T>>;
        useQuery: <T extends Prisma.UserFindFirstOrThrowArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserFindFirstOrThrowArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findMany: {

        query: <T extends Prisma.UserFindManyArgs>(input?: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>) => Promise<Array<Prisma.UserGetPayload<T>>>;
        useQuery: <T extends Prisma.UserFindManyArgs, ResT = Array<Prisma.UserGetPayload<T>>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindManyArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserFindManyArgs, ResT = Array<Prisma.UserGetPayload<T>>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindManyArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findUnique: {

        query: <T extends Prisma.UserFindUniqueArgs>(input: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>) => Promise<Prisma.UserGetPayload<T> | null>;
        useQuery: <T extends Prisma.UserFindUniqueArgs, ResT = Prisma.UserGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserFindUniqueArgs, ResT = Prisma.UserGetPayload<T> | null, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    findUniqueOrThrow: {

        query: <T extends Prisma.UserFindUniqueOrThrowArgs>(input: Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>) => Promise<Prisma.UserGetPayload<T>>;
        useQuery: <T extends Prisma.UserFindUniqueOrThrowArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserFindUniqueOrThrowArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
            trpc?: TRPCRequestOptions;
            queryKey?: string;
            watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    groupBy: {

        query: <T extends Prisma.UserGroupByArgs,
            HasSelectOrTake extends Prisma.Or<
                Prisma.Extends<'skip', Prisma.Keys<T>>,
                Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
            ? { orderBy: Prisma.UserGroupByArgs['orderBy'] }
            : { orderBy?: Prisma.UserGroupByArgs['orderBy'] },
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
        >(input: Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors) => Promise<{} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors>;
        useQuery: <T extends Prisma.UserGroupByArgs,
            HasSelectOrTake extends Prisma.Or<
                Prisma.Extends<'skip', Prisma.Keys<T>>,
                Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
            ? { orderBy: Prisma.UserGroupByArgs['orderBy'] }
            : { orderBy?: Prisma.UserGroupByArgs['orderBy'] },
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
            , ResT = {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserGroupByArgs,
            HasSelectOrTake extends Prisma.Or<
                Prisma.Extends<'skip', Prisma.Keys<T>>,
                Prisma.Extends<'take', Prisma.Keys<T>>
            >,
            OrderByArg extends Prisma.True extends HasSelectOrTake
            ? { orderBy: Prisma.UserGroupByArgs['orderBy'] }
            : { orderBy?: Prisma.UserGroupByArgs['orderBy'] },
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
            , ResT = {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input: MaybeRefOrGetter<Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
    updateMany: {

        mutate: <T extends Prisma.UserUpdateManyArgs>(input: Prisma.SelectSubset<T, Prisma.UserUpdateManyArgs>) => Promise<Prisma.BatchPayload>;
        useMutation: <T extends Prisma.UserUpdateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserUpdateManyArgs, ResT = Prisma.BatchPayload, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.UserUpdateManyArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    update: {

        mutate: <T extends Prisma.UserUpdateArgs>(input: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>) => Promise<Prisma.UserGetPayload<T>>;
        useMutation: <T extends Prisma.UserUpdateArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserUpdateArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    upsert: {

        mutate: <T extends Prisma.UserUpsertArgs>(input: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>) => Promise<Prisma.UserGetPayload<T>>;
        useMutation: <T extends Prisma.UserUpsertArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy'> & {
            trpc?: TRPCRequestOptions;
        }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE> & {
            mutate: <T extends Prisma.UserUpsertArgs, ResT = Prisma.UserGetPayload<T>, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>>(input: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>) => Promise<UnwrapRef<AsyncData<PickFrom<DataT, PickKeys> | null, DataE>['data']>>;
        };

    };
    count: {

        query: <T extends Prisma.UserCountArgs>(input?: Prisma.Subset<T, Prisma.UserCountArgs>) => Promise<'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number>;
        useQuery: <T extends Prisma.UserCountArgs, ResT = 'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.Subset<T, Prisma.UserCountArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;
        useLazyQuery: <T extends Prisma.UserCountArgs, ResT = 'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number, DataE = TRPCClientErrorLike<AppRouter>, DataT = ResT, PickKeys extends KeysOf<DataT> = KeysOf<DataT>, DefaultT = null>(input?: MaybeRefOrGetter<Prisma.Subset<T, Prisma.UserCountArgs>>, opts?: Omit<AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>, 'lazy' | 'watch'> & {
                trpc?: TRPCRequestOptions;
                queryKey?: string;
                watch?: AsyncDataOptions<ResT, DataT, PickKeys, DefaultT>['watch'] | false;
            }) => AsyncData<PickFrom<DataT, PickKeys> | DefaultT, DataE>;

    };
}
