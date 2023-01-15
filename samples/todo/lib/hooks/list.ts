import type { Prisma, List } from "@prisma/client";
import { useContext } from 'react';
import { RequestHandlerContext, type RequestOptions } from '@zenstackhq/react/runtime';
import * as request from '@zenstackhq/react/runtime';

export function useList() {
    const { endpoint } = useContext(RequestHandlerContext);
    const prefixesToMutate = [`${endpoint}/list/find`, `${endpoint}/list/aggregate`, `${endpoint}/list/count`, `${endpoint}/list/groupBy`];
    const mutate = request.getMutate(prefixesToMutate);

    async function create<T extends Prisma.ListCreateArgs>(args: Prisma.SelectSubset<T, Prisma.ListCreateArgs>) {
        try {
            return await request.post<Prisma.SelectSubset<T, Prisma.ListCreateArgs>, Prisma.CheckSelect<T, List, Prisma.ListGetPayload<T>>>(`${endpoint}/list/create`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function createMany<T extends Prisma.ListCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.ListCreateManyArgs>) {
        return await request.post<Prisma.SelectSubset<T, Prisma.ListCreateManyArgs>, Prisma.BatchPayload>(`${endpoint}/list/createMany`, args, mutate);
    }

    function findMany<T extends Prisma.ListFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.ListFindManyArgs>, options?: RequestOptions<Array<Prisma.ListGetPayload<T>>>) {
        return request.get<Array<Prisma.ListGetPayload<T>>>(`${endpoint}/list/findMany`, args, options);
    }

    function findUnique<T extends Prisma.ListFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.ListFindUniqueArgs>, options?: RequestOptions<Prisma.ListGetPayload<T>>) {
        return request.get<Prisma.ListGetPayload<T>>(`${endpoint}/list/findUnique`, args, options);
    }

    function findFirst<T extends Prisma.ListFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.ListFindFirstArgs>, options?: RequestOptions<Prisma.ListGetPayload<T>>) {
        return request.get<Prisma.ListGetPayload<T>>(`${endpoint}/list/findFirst`, args, options);
    }

    async function update<T extends Prisma.ListUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.ListUpdateArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.ListUpdateArgs>, Prisma.ListGetPayload<T>>(`${endpoint}/list/update`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function updateMany<T extends Prisma.ListUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.ListUpdateManyArgs>) {
        return await request.put<Prisma.SelectSubset<T, Prisma.ListUpdateManyArgs>, Prisma.BatchPayload>(`${endpoint}/list/updateMany`, args, mutate);
    }

    async function upsert<T extends Prisma.ListUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.ListUpsertArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.ListUpsertArgs>, Prisma.ListGetPayload<T>>(`${endpoint}/list/upsert`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function del<T extends Prisma.ListDeleteArgs>(args?: Prisma.SelectSubset<T, Prisma.ListDeleteArgs>) {
        try {
            return await request.del<Prisma.ListGetPayload<T>>(`${endpoint}/list/delete`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function deleteMany<T extends Prisma.ListDeleteManyArgs>(args?: Prisma.SelectSubset<T, Prisma.ListDeleteManyArgs>) {
        return await request.del<Prisma.BatchPayload>(`${endpoint}/list/deleteMany`, args, mutate);
    }

    function aggregate<T extends Prisma.ListAggregateArgs>(args: Prisma.Subset<T, Prisma.ListAggregateArgs>, options?: RequestOptions<Prisma.GetListAggregateType<T>>) {
        return request.get<Prisma.GetListAggregateType<T>>(`${endpoint}/list/aggregate`, args, options);
    }

    function groupBy<T extends Prisma.ListGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserGroupByArgs['orderBy'] } : { orderBy?: Prisma.UserGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.TupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
        }[OrderFields]>(args: Prisma.SubsetIntersection<T, Prisma.ListGroupByArgs, OrderByArg> & InputErrors, options?: RequestOptions<{} extends InputErrors ? Prisma.GetListGroupByPayload<T> : InputErrors>) {
        return request.get<{} extends InputErrors ? Prisma.GetListGroupByPayload<T> : InputErrors>(`${endpoint}/list/groupBy`, args, options);
    }

    function count<T extends Prisma.ListCountArgs>(args: Prisma.Subset<T, Prisma.ListCountArgs>, options?: RequestOptions<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.ListCountAggregateOutputType> : number>) {
        return request.get<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.ListCountAggregateOutputType> : number>(`${endpoint}/list/count`, args, options);
    }
    return { create, createMany, findMany, findUnique, findFirst, update, updateMany, upsert, del, deleteMany, aggregate, groupBy, count };
}
