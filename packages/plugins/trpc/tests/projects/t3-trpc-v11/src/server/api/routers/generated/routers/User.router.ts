/* eslint-disable */
import { db } from ".";
import { createTRPCRouter } from "../../generated-router-helper";
import { procedure } from "../../generated-router-helper";
import * as _Schema from '@zenstackhq/runtime/zod/input';
const $Schema: typeof _Schema = (_Schema as any).default ?? _Schema;
import { checkRead, checkMutate } from '../helper';
import type { Prisma } from '@prisma/client';
import type { UseTRPCMutationOptions, UseTRPCMutationResult, UseTRPCQueryOptions, UseTRPCQueryResult, UseTRPCInfiniteQueryOptions, UseTRPCInfiniteQueryResult } from '@trpc/react-query/shared';
import type { TRPCClientErrorLike } from '@trpc/client';
import type { AnyTRPCRouter as AnyRouter } from '@trpc/server';
import type { UseTRPCSuspenseQueryOptions, UseTRPCSuspenseQueryResult, UseTRPCSuspenseInfiniteQueryOptions, UseTRPCSuspenseInfiniteQueryResult } from '@trpc/react-query/shared';

export default function createRouter() {
    return createTRPCRouter({

        aggregate: procedure.input($Schema.UserInputSchema.aggregate).query(({ ctx, input }) => checkRead(db(ctx).user.aggregate(input as any))),

        createMany: procedure.input($Schema.UserInputSchema.createMany).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.createMany(input as any))),

        create: procedure.input($Schema.UserInputSchema.create).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.create(input as any))),

        deleteMany: procedure.input($Schema.UserInputSchema.deleteMany).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.deleteMany(input as any))),

        delete: procedure.input($Schema.UserInputSchema.delete).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.delete(input as any))),

        findFirst: procedure.input($Schema.UserInputSchema.findFirst).query(({ ctx, input }) => checkRead(db(ctx).user.findFirst(input as any))),

        findFirstOrThrow: procedure.input($Schema.UserInputSchema.findFirst).query(({ ctx, input }) => checkRead(db(ctx).user.findFirstOrThrow(input as any))),

        findMany: procedure.input($Schema.UserInputSchema.findMany).query(({ ctx, input }) => checkRead(db(ctx).user.findMany(input as any))),

        findUnique: procedure.input($Schema.UserInputSchema.findUnique).query(({ ctx, input }) => checkRead(db(ctx).user.findUnique(input as any))),

        findUniqueOrThrow: procedure.input($Schema.UserInputSchema.findUnique).query(({ ctx, input }) => checkRead(db(ctx).user.findUniqueOrThrow(input as any))),

        groupBy: procedure.input($Schema.UserInputSchema.groupBy).query(({ ctx, input }) => checkRead(db(ctx).user.groupBy(input as any))),

        updateMany: procedure.input($Schema.UserInputSchema.updateMany).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.updateMany(input as any))),

        update: procedure.input($Schema.UserInputSchema.update).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.update(input as any))),

        upsert: procedure.input($Schema.UserInputSchema.upsert).mutation(async ({ ctx, input }) => checkMutate(db(ctx).user.upsert(input as any))),

        count: procedure.input($Schema.UserInputSchema.count).query(({ ctx, input }) => checkRead(db(ctx).user.count(input as any))),

    }
    );
}

export interface ClientType<AppRouter extends AnyRouter, Context = AppRouter['_def']['_config']['$types']['ctx']> {
    aggregate: {

        useQuery: <T extends Prisma.UserAggregateArgs, TData = Prisma.GetUserAggregateType<T>>(
            input: Prisma.Subset<T, Prisma.UserAggregateArgs>,
            opts?: UseTRPCQueryOptions<Prisma.GetUserAggregateType<T>, TData, Error>
        ) => UseTRPCQueryResult<
            TData,
            TRPCClientErrorLike<AppRouter>
        >;
        useInfiniteQuery: <T extends Prisma.UserAggregateArgs>(
            input: Omit<Prisma.Subset<T, Prisma.UserAggregateArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, Prisma.GetUserAggregateType<T>, Error>
        ) => UseTRPCInfiniteQueryResult<
            Prisma.GetUserAggregateType<T>,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserAggregateArgs, TData = Prisma.GetUserAggregateType<T>>(
            input: Prisma.Subset<T, Prisma.UserAggregateArgs>,
            opts?: UseTRPCSuspenseQueryOptions<Prisma.GetUserAggregateType<T>, TData, Error>
        ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserAggregateArgs>(
            input: Omit<Prisma.Subset<T, Prisma.UserAggregateArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, Prisma.GetUserAggregateType<T>, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<Prisma.GetUserAggregateType<T>, TRPCClientErrorLike<AppRouter>, T>;

    };
    createMany: {

        useMutation: <T extends Prisma.UserCreateManyArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserCreateManyArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.BatchPayload,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.BatchPayload, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserCreateManyArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserCreateManyArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.BatchPayload, Context>) => Promise<Prisma.BatchPayload>
            };

    };
    create: {

        useMutation: <T extends Prisma.UserCreateArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserCreateArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.UserGetPayload<T>,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserCreateArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserCreateArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.UserGetPayload<T>, Context>) => Promise<Prisma.UserGetPayload<T>>
            };

    };
    deleteMany: {

        useMutation: <T extends Prisma.UserDeleteManyArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserDeleteManyArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.BatchPayload,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.BatchPayload, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserDeleteManyArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserDeleteManyArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.BatchPayload, Context>) => Promise<Prisma.BatchPayload>
            };

    };
    delete: {

        useMutation: <T extends Prisma.UserDeleteArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserDeleteArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.UserGetPayload<T>,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserDeleteArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserDeleteArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.UserGetPayload<T>, Context>) => Promise<Prisma.UserGetPayload<T>>
            };

    };
    findFirst: {

        useQuery: <T extends Prisma.UserFindFirstArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>,
            opts?: UseTRPCQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCQueryResult<
            TData,
            TRPCClientErrorLike<AppRouter>
        >;
        useInfiniteQuery: <T extends Prisma.UserFindFirstArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCInfiniteQueryResult<
            Prisma.UserGetPayload<T>,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserFindFirstArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>,
            opts?: UseTRPCSuspenseQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserFindFirstArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, T>;

    };
    findFirstOrThrow: {

        useQuery: <T extends Prisma.UserFindFirstOrThrowArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>,
            opts?: UseTRPCQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCQueryResult<
            TData,
            TRPCClientErrorLike<AppRouter>
        >;
        useInfiniteQuery: <T extends Prisma.UserFindFirstOrThrowArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCInfiniteQueryResult<
            Prisma.UserGetPayload<T>,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserFindFirstOrThrowArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>,
            opts?: UseTRPCSuspenseQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserFindFirstOrThrowArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindFirstOrThrowArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, T>;

    };
    findMany: {

        useQuery: <T extends Prisma.UserFindManyArgs, TData = Array<Prisma.UserGetPayload<T>>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>,
            opts?: UseTRPCQueryOptions<Array<Prisma.UserGetPayload<T>>, TData, Error>
        ) => UseTRPCQueryResult<
            TData,
            TRPCClientErrorLike<AppRouter>
        >;
        useInfiniteQuery: <T extends Prisma.UserFindManyArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindManyArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, Array<Prisma.UserGetPayload<T>>, Error>
        ) => UseTRPCInfiniteQueryResult<
            Array<Prisma.UserGetPayload<T>>,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserFindManyArgs, TData = Array<Prisma.UserGetPayload<T>>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>,
            opts?: UseTRPCSuspenseQueryOptions<Array<Prisma.UserGetPayload<T>>, TData, Error>
        ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserFindManyArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindManyArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, Array<Prisma.UserGetPayload<T>>, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<Array<Prisma.UserGetPayload<T>>, TRPCClientErrorLike<AppRouter>, T>;

    };
    findUnique: {

        useQuery: <T extends Prisma.UserFindUniqueArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
            opts?: UseTRPCQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCQueryResult<
            TData,
            TRPCClientErrorLike<AppRouter>
        >;
        useInfiniteQuery: <T extends Prisma.UserFindUniqueArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCInfiniteQueryResult<
            Prisma.UserGetPayload<T>,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserFindUniqueArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>,
            opts?: UseTRPCSuspenseQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserFindUniqueArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, T>;

    };
    findUniqueOrThrow: {

        useQuery: <T extends Prisma.UserFindUniqueOrThrowArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>,
            opts?: UseTRPCQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCQueryResult<
            TData,
            TRPCClientErrorLike<AppRouter>
        >;
        useInfiniteQuery: <T extends Prisma.UserFindUniqueOrThrowArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCInfiniteQueryResult<
            Prisma.UserGetPayload<T>,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserFindUniqueOrThrowArgs, TData = Prisma.UserGetPayload<T>>(
            input: Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>,
            opts?: UseTRPCSuspenseQueryOptions<Prisma.UserGetPayload<T>, TData, Error>
        ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserFindUniqueOrThrowArgs>(
            input: Omit<Prisma.SelectSubset<T, Prisma.UserFindUniqueOrThrowArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, Prisma.UserGetPayload<T>, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, T>;

    };
    groupBy: {

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
            , TData = {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors>(
                input: Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors,
                opts?: UseTRPCQueryOptions<{} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, TData, Error>
            ) => UseTRPCQueryResult<
                TData,
                TRPCClientErrorLike<AppRouter>
            >;
        useInfiniteQuery: <T extends Prisma.UserGroupByArgs,
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
        >(
            input: Omit<Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, Error>
        ) => UseTRPCInfiniteQueryResult<
            {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserGroupByArgs,
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
            , TData = {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors>(
                input: Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors,
                opts?: UseTRPCSuspenseQueryOptions<{} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, TData, Error>
            ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserGroupByArgs,
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
        >(
            input: Omit<Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, {} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<{} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors, TRPCClientErrorLike<AppRouter>, T>;

    };
    updateMany: {

        useMutation: <T extends Prisma.UserUpdateManyArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserUpdateManyArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.BatchPayload,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.BatchPayload, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserUpdateManyArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserUpdateManyArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.BatchPayload, Context>) => Promise<Prisma.BatchPayload>
            };

    };
    update: {

        useMutation: <T extends Prisma.UserUpdateArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserUpdateArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.UserGetPayload<T>,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserUpdateArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserUpdateArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.UserGetPayload<T>, Context>) => Promise<Prisma.UserGetPayload<T>>
            };

    };
    upsert: {

        useMutation: <T extends Prisma.UserUpsertArgs>(opts?: UseTRPCMutationOptions<
            Prisma.UserUpsertArgs,
            TRPCClientErrorLike<AppRouter>,
            Prisma.UserGetPayload<T>,
            Context
        >,) =>
            Omit<UseTRPCMutationResult<Prisma.UserGetPayload<T>, TRPCClientErrorLike<AppRouter>, Prisma.SelectSubset<T, Prisma.UserUpsertArgs>, Context>, 'mutateAsync'> & {
                mutateAsync:
                <T extends Prisma.UserUpsertArgs>(variables: T, opts?: UseTRPCMutationOptions<T, TRPCClientErrorLike<AppRouter>, Prisma.UserGetPayload<T>, Context>) => Promise<Prisma.UserGetPayload<T>>
            };

    };
    count: {

        useQuery: <T extends Prisma.UserCountArgs, TData = 'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number>(
                input: Prisma.Subset<T, Prisma.UserCountArgs>,
                opts?: UseTRPCQueryOptions<'select' extends keyof T
                    ? T['select'] extends true
                    ? number
                    : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
                    : number, TData, Error>
            ) => UseTRPCQueryResult<
                TData,
                TRPCClientErrorLike<AppRouter>
            >;
        useInfiniteQuery: <T extends Prisma.UserCountArgs>(
            input: Omit<Prisma.Subset<T, Prisma.UserCountArgs>, 'cursor'>,
            opts?: UseTRPCInfiniteQueryOptions<T, 'select' extends keyof T
                ? T['select'] extends true
                ? number
                : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
                : number, Error>
        ) => UseTRPCInfiniteQueryResult<
            'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number,
            TRPCClientErrorLike<AppRouter>,
            T
        >;
        useSuspenseQuery: <T extends Prisma.UserCountArgs, TData = 'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number>(
                input: Prisma.Subset<T, Prisma.UserCountArgs>,
                opts?: UseTRPCSuspenseQueryOptions<'select' extends keyof T
                    ? T['select'] extends true
                    ? number
                    : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
                    : number, TData, Error>
            ) => UseTRPCSuspenseQueryResult<TData, TRPCClientErrorLike<AppRouter>>;
        useSuspenseInfiniteQuery: <T extends Prisma.UserCountArgs>(
            input: Omit<Prisma.Subset<T, Prisma.UserCountArgs>, 'cursor'>,
            opts?: UseTRPCSuspenseInfiniteQueryOptions<T, 'select' extends keyof T
                ? T['select'] extends true
                ? number
                : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
                : number, Error>
        ) => UseTRPCSuspenseInfiniteQueryResult<'select' extends keyof T
            ? T['select'] extends true
            ? number
            : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType>
            : number, TRPCClientErrorLike<AppRouter>, T>;

    };
}
