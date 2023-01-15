import type { Prisma, Space } from "@prisma/client";
import { useContext } from 'react';
import { RequestHandlerContext, type RequestOptions } from '@zenstackhq/react/runtime';
import * as request from '@zenstackhq/react/runtime';

export function useSpace() {
    const { endpoint } = useContext(RequestHandlerContext);
    const prefixesToMutate = [`${endpoint}/space/find`, `${endpoint}/space/aggregate`, `${endpoint}/space/count`, `${endpoint}/space/groupBy`];
    const mutate = request.getMutate(prefixesToMutate);

    async function create<T extends Prisma.SpaceCreateArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceCreateArgs>) {
        try {
            return await request.post<Prisma.SelectSubset<T, Prisma.SpaceCreateArgs>, Prisma.CheckSelect<T, Space, Prisma.SpaceGetPayload<T>>>(`${endpoint}/space/create`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function createMany<T extends Prisma.SpaceCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceCreateManyArgs>) {
        return await request.post<Prisma.SelectSubset<T, Prisma.SpaceCreateManyArgs>, Prisma.BatchPayload>(`${endpoint}/space/createMany`, args, mutate);
    }

    function findMany<T extends Prisma.SpaceFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.SpaceFindManyArgs>, options?: RequestOptions<Array<Prisma.SpaceGetPayload<T>>>) {
        return request.get<Array<Prisma.SpaceGetPayload<T>>>(`${endpoint}/space/findMany`, args, options);
    }

    function findUnique<T extends Prisma.SpaceFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceFindUniqueArgs>, options?: RequestOptions<Prisma.SpaceGetPayload<T>>) {
        return request.get<Prisma.SpaceGetPayload<T>>(`${endpoint}/space/findUnique`, args, options);
    }

    function findFirst<T extends Prisma.SpaceFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceFindFirstArgs>, options?: RequestOptions<Prisma.SpaceGetPayload<T>>) {
        return request.get<Prisma.SpaceGetPayload<T>>(`${endpoint}/space/findFirst`, args, options);
    }

    async function update<T extends Prisma.SpaceUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUpdateArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.SpaceUpdateArgs>, Prisma.SpaceGetPayload<T>>(`${endpoint}/space/update`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function updateMany<T extends Prisma.SpaceUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUpdateManyArgs>) {
        return await request.put<Prisma.SelectSubset<T, Prisma.SpaceUpdateManyArgs>, Prisma.BatchPayload>(`${endpoint}/space/updateMany`, args, mutate);
    }

    async function upsert<T extends Prisma.SpaceUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.SpaceUpsertArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.SpaceUpsertArgs>, Prisma.SpaceGetPayload<T>>(`${endpoint}/space/upsert`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function del<T extends Prisma.SpaceDeleteArgs>(args?: Prisma.SelectSubset<T, Prisma.SpaceDeleteArgs>) {
        try {
            return await request.del<Prisma.SpaceGetPayload<T>>(`${endpoint}/space/delete`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function deleteMany<T extends Prisma.SpaceDeleteManyArgs>(args?: Prisma.SelectSubset<T, Prisma.SpaceDeleteManyArgs>) {
        return await request.del<Prisma.BatchPayload>(`${endpoint}/space/deleteMany`, args, mutate);
    }

    function aggregate<T extends Prisma.SpaceAggregateArgs>(args: Prisma.Subset<T, Prisma.SpaceAggregateArgs>, options?: RequestOptions<Prisma.GetSpaceAggregateType<T>>) {
        return request.get<Prisma.GetSpaceAggregateType<T>>(`${endpoint}/space/aggregate`, args, options);
    }

    function groupBy<T extends Prisma.SpaceGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserGroupByArgs['orderBy'] } : { orderBy?: Prisma.UserGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.TupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
        }[OrderFields]>(args: Prisma.SubsetIntersection<T, Prisma.SpaceGroupByArgs, OrderByArg> & InputErrors, options?: RequestOptions<{} extends InputErrors ? Prisma.GetSpaceGroupByPayload<T> : InputErrors>) {
        return request.get<{} extends InputErrors ? Prisma.GetSpaceGroupByPayload<T> : InputErrors>(`${endpoint}/space/groupBy`, args, options);
    }

    function count<T extends Prisma.SpaceCountArgs>(args: Prisma.Subset<T, Prisma.SpaceCountArgs>, options?: RequestOptions<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.SpaceCountAggregateOutputType> : number>) {
        return request.get<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.SpaceCountAggregateOutputType> : number>(`${endpoint}/space/count`, args, options);
    }
    return { create, createMany, findMany, findUnique, findFirst, update, updateMany, upsert, del, deleteMany, aggregate, groupBy, count };
}
