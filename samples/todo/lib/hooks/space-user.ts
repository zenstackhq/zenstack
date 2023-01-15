import type { Prisma, SpaceUser } from "@prisma/client";
import { useContext } from 'react';
import { RequestHandlerContext, type RequestOptions } from '@zenstackhq/react/runtime';
import * as request from '@zenstackhq/react/runtime';

export function useSpaceUser() {
    const { endpoint } = useContext(RequestHandlerContext);
    const prefixesToMutate = [`${endpoint}/spaceUser/find`, `${endpoint}/spaceUser/aggregate`, `${endpoint}/spaceUser/count`, `${endpoint}/spaceUser/groupBy`];
    const mutate = request.getMutate(prefixesToMutate);

    async function create<T extends Prisma.SpaceUserCreateArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserCreateArgs>) {
        try {
            return await request.post<Prisma.SelectSubset<T, Prisma.SpaceUserCreateArgs>, Prisma.CheckSelect<T, SpaceUser, Prisma.SpaceUserGetPayload<T>>>(`${endpoint}/spaceUser/create`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function createMany<T extends Prisma.SpaceUserCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserCreateManyArgs>) {
        return await request.post<Prisma.SelectSubset<T, Prisma.SpaceUserCreateManyArgs>, Prisma.BatchPayload>(`${endpoint}/spaceUser/createMany`, args, mutate);
    }

    function findMany<T extends Prisma.SpaceUserFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.SpaceUserFindManyArgs>, options?: RequestOptions<Array<Prisma.SpaceUserGetPayload<T>>>) {
        return request.get<Array<Prisma.SpaceUserGetPayload<T>>>(`${endpoint}/spaceUser/findMany`, args, options);
    }

    function findUnique<T extends Prisma.SpaceUserFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserFindUniqueArgs>, options?: RequestOptions<Prisma.SpaceUserGetPayload<T>>) {
        return request.get<Prisma.SpaceUserGetPayload<T>>(`${endpoint}/spaceUser/findUnique`, args, options);
    }

    function findFirst<T extends Prisma.SpaceUserFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserFindFirstArgs>, options?: RequestOptions<Prisma.SpaceUserGetPayload<T>>) {
        return request.get<Prisma.SpaceUserGetPayload<T>>(`${endpoint}/spaceUser/findFirst`, args, options);
    }

    async function update<T extends Prisma.SpaceUserUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserUpdateArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.SpaceUserUpdateArgs>, Prisma.SpaceUserGetPayload<T>>(`${endpoint}/spaceUser/update`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function updateMany<T extends Prisma.SpaceUserUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserUpdateManyArgs>) {
        return await request.put<Prisma.SelectSubset<T, Prisma.SpaceUserUpdateManyArgs>, Prisma.BatchPayload>(`${endpoint}/spaceUser/updateMany`, args, mutate);
    }

    async function upsert<T extends Prisma.SpaceUserUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUserUpsertArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.SpaceUserUpsertArgs>, Prisma.SpaceUserGetPayload<T>>(`${endpoint}/spaceUser/upsert`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function del<T extends Prisma.SpaceUserDeleteArgs>(args?: Prisma.SelectSubset<T, Prisma.SpaceUserDeleteArgs>) {
        try {
            return await request.del<Prisma.SpaceUserGetPayload<T>>(`${endpoint}/spaceUser/delete`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function deleteMany<T extends Prisma.SpaceUserDeleteManyArgs>(args?: Prisma.SelectSubset<T, Prisma.SpaceUserDeleteManyArgs>) {
        return await request.del<Prisma.BatchPayload>(`${endpoint}/spaceUser/deleteMany`, args, mutate);
    }

    function aggregate<T extends Prisma.SpaceUserAggregateArgs>(args: Prisma.Subset<T, Prisma.SpaceUserAggregateArgs>, options?: RequestOptions<Prisma.GetSpaceUserAggregateType<T>>) {
        return request.get<Prisma.GetSpaceUserAggregateType<T>>(`${endpoint}/spaceUser/aggregate`, args, options);
    }

    function groupBy<T extends Prisma.SpaceUserGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserGroupByArgs['orderBy'] } : { orderBy?: Prisma.UserGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.TupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
        }[OrderFields]>(args: Prisma.SubsetIntersection<T, Prisma.SpaceUserGroupByArgs, OrderByArg> & InputErrors, options?: RequestOptions<{} extends InputErrors ? Prisma.GetSpaceUserGroupByPayload<T> : InputErrors>) {
        return request.get<{} extends InputErrors ? Prisma.GetSpaceUserGroupByPayload<T> : InputErrors>(`${endpoint}/spaceUser/groupBy`, args, options);
    }

    function count<T extends Prisma.SpaceUserCountArgs>(args: Prisma.Subset<T, Prisma.SpaceUserCountArgs>, options?: RequestOptions<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.SpaceUserCountAggregateOutputType> : number>) {
        return request.get<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.SpaceUserCountAggregateOutputType> : number>(`${endpoint}/spaceUser/count`, args, options);
    }
    return { create, createMany, findMany, findUnique, findFirst, update, updateMany, upsert, del, deleteMany, aggregate, groupBy, count };
}
