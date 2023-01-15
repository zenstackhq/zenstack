import type { Prisma, User } from "@prisma/client";
import { useContext } from 'react';
import { RequestHandlerContext, type RequestOptions } from '@zenstackhq/react/runtime';
import * as request from '@zenstackhq/react/runtime';

export function useUser() {
    const { endpoint } = useContext(RequestHandlerContext);
    const prefixesToMutate = [`${endpoint}/user/find`, `${endpoint}/user/aggregate`, `${endpoint}/user/count`, `${endpoint}/user/groupBy`];
    const mutate = request.getMutate(prefixesToMutate);

    async function create<T extends Prisma.UserCreateArgs>(args: Prisma.SelectSubset<T, Prisma.UserCreateArgs>) {
        try {
            return await request.post<Prisma.SelectSubset<T, Prisma.UserCreateArgs>, Prisma.CheckSelect<T, User, Prisma.UserGetPayload<T>>>(`${endpoint}/user/create`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function createMany<T extends Prisma.UserCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.UserCreateManyArgs>) {
        return await request.post<Prisma.SelectSubset<T, Prisma.UserCreateManyArgs>, Prisma.BatchPayload>(`${endpoint}/user/createMany`, args, mutate);
    }

    function findMany<T extends Prisma.UserFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.UserFindManyArgs>, options?: RequestOptions<Array<Prisma.UserGetPayload<T>>>) {
        return request.get<Array<Prisma.UserGetPayload<T>>>(`${endpoint}/user/findMany`, args, options);
    }

    function findUnique<T extends Prisma.UserFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.UserFindUniqueArgs>, options?: RequestOptions<Prisma.UserGetPayload<T>>) {
        return request.get<Prisma.UserGetPayload<T>>(`${endpoint}/user/findUnique`, args, options);
    }

    function findFirst<T extends Prisma.UserFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.UserFindFirstArgs>, options?: RequestOptions<Prisma.UserGetPayload<T>>) {
        return request.get<Prisma.UserGetPayload<T>>(`${endpoint}/user/findFirst`, args, options);
    }

    async function update<T extends Prisma.UserUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.UserUpdateArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.UserUpdateArgs>, Prisma.UserGetPayload<T>>(`${endpoint}/user/update`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function updateMany<T extends Prisma.UserUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.UserUpdateManyArgs>) {
        return await request.put<Prisma.SelectSubset<T, Prisma.UserUpdateManyArgs>, Prisma.BatchPayload>(`${endpoint}/user/updateMany`, args, mutate);
    }

    async function upsert<T extends Prisma.UserUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.UserUpsertArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.UserUpsertArgs>, Prisma.UserGetPayload<T>>(`${endpoint}/user/upsert`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function del<T extends Prisma.UserDeleteArgs>(args?: Prisma.SelectSubset<T, Prisma.UserDeleteArgs>) {
        try {
            return await request.del<Prisma.UserGetPayload<T>>(`${endpoint}/user/delete`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function deleteMany<T extends Prisma.UserDeleteManyArgs>(args?: Prisma.SelectSubset<T, Prisma.UserDeleteManyArgs>) {
        return await request.del<Prisma.BatchPayload>(`${endpoint}/user/deleteMany`, args, mutate);
    }

    function aggregate<T extends Prisma.UserAggregateArgs>(args: Prisma.Subset<T, Prisma.UserAggregateArgs>, options?: RequestOptions<Prisma.GetUserAggregateType<T>>) {
        return request.get<Prisma.GetUserAggregateType<T>>(`${endpoint}/user/aggregate`, args, options);
    }

    function groupBy<T extends Prisma.UserGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserGroupByArgs['orderBy'] } : { orderBy?: Prisma.UserGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.TupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
        }[OrderFields]>(args: Prisma.SubsetIntersection<T, Prisma.UserGroupByArgs, OrderByArg> & InputErrors, options?: RequestOptions<{} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors>) {
        return request.get<{} extends InputErrors ? Prisma.GetUserGroupByPayload<T> : InputErrors>(`${endpoint}/user/groupBy`, args, options);
    }

    function count<T extends Prisma.UserCountArgs>(args: Prisma.Subset<T, Prisma.UserCountArgs>, options?: RequestOptions<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType> : number>) {
        return request.get<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.UserCountAggregateOutputType> : number>(`${endpoint}/user/count`, args, options);
    }
    return { create, createMany, findMany, findUnique, findFirst, update, updateMany, upsert, del, deleteMany, aggregate, groupBy, count };
}
