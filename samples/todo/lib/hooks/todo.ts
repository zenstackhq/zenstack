import type { Prisma, Todo } from "@prisma/client";
import { useContext } from 'react';
import { RequestHandlerContext, type RequestOptions } from '@zenstackhq/react/runtime';
import * as request from '@zenstackhq/react/runtime';

export function useTodo() {
    const { endpoint } = useContext(RequestHandlerContext);
    const prefixesToMutate = [`${endpoint}/todo/find`, `${endpoint}/todo/aggregate`, `${endpoint}/todo/count`, `${endpoint}/todo/groupBy`];
    const mutate = request.getMutate(prefixesToMutate);

    async function create<T extends Prisma.TodoCreateArgs>(args: Prisma.SelectSubset<T, Prisma.TodoCreateArgs>) {
        try {
            return await request.post<Prisma.SelectSubset<T, Prisma.TodoCreateArgs>, Prisma.CheckSelect<T, Todo, Prisma.TodoGetPayload<T>>>(`${endpoint}/todo/create`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function createMany<T extends Prisma.TodoCreateManyArgs>(args: Prisma.SelectSubset<T, Prisma.TodoCreateManyArgs>) {
        return await request.post<Prisma.SelectSubset<T, Prisma.TodoCreateManyArgs>, Prisma.BatchPayload>(`${endpoint}/todo/createMany`, args, mutate);
    }

    function findMany<T extends Prisma.TodoFindManyArgs>(args?: Prisma.SelectSubset<T, Prisma.TodoFindManyArgs>, options?: RequestOptions<Array<Prisma.TodoGetPayload<T>>>) {
        return request.get<Array<Prisma.TodoGetPayload<T>>>(`${endpoint}/todo/findMany`, args, options);
    }

    function findUnique<T extends Prisma.TodoFindUniqueArgs>(args: Prisma.SelectSubset<T, Prisma.TodoFindUniqueArgs>, options?: RequestOptions<Prisma.TodoGetPayload<T>>) {
        return request.get<Prisma.TodoGetPayload<T>>(`${endpoint}/todo/findUnique`, args, options);
    }

    function findFirst<T extends Prisma.TodoFindFirstArgs>(args: Prisma.SelectSubset<T, Prisma.TodoFindFirstArgs>, options?: RequestOptions<Prisma.TodoGetPayload<T>>) {
        return request.get<Prisma.TodoGetPayload<T>>(`${endpoint}/todo/findFirst`, args, options);
    }

    async function update<T extends Prisma.TodoUpdateArgs>(args: Prisma.SelectSubset<T, Prisma.TodoUpdateArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.TodoUpdateArgs>, Prisma.TodoGetPayload<T>>(`${endpoint}/todo/update`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function updateMany<T extends Prisma.TodoUpdateManyArgs>(args: Prisma.SelectSubset<T, Prisma.TodoUpdateManyArgs>) {
        return await request.put<Prisma.SelectSubset<T, Prisma.TodoUpdateManyArgs>, Prisma.BatchPayload>(`${endpoint}/todo/updateMany`, args, mutate);
    }

    async function upsert<T extends Prisma.TodoUpsertArgs>(args: Prisma.SelectSubset<T, Prisma.TodoUpsertArgs>) {
        try {
            return await request.put<Prisma.SelectSubset<T, Prisma.TodoUpsertArgs>, Prisma.TodoGetPayload<T>>(`${endpoint}/todo/upsert`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function del<T extends Prisma.TodoDeleteArgs>(args?: Prisma.SelectSubset<T, Prisma.TodoDeleteArgs>) {
        try {
            return await request.del<Prisma.TodoGetPayload<T>>(`${endpoint}/todo/delete`, args, mutate);
        } catch (err: any) {
            if (err.prisma && err.code === 'P2004') {
                // unable to readback data
                return undefined;
            } else {
                throw err;
            }
        }
    }

    async function deleteMany<T extends Prisma.TodoDeleteManyArgs>(args?: Prisma.SelectSubset<T, Prisma.TodoDeleteManyArgs>) {
        return await request.del<Prisma.BatchPayload>(`${endpoint}/todo/deleteMany`, args, mutate);
    }

    function aggregate<T extends Prisma.TodoAggregateArgs>(args: Prisma.Subset<T, Prisma.TodoAggregateArgs>, options?: RequestOptions<Prisma.GetTodoAggregateType<T>>) {
        return request.get<Prisma.GetTodoAggregateType<T>>(`${endpoint}/todo/aggregate`, args, options);
    }

    function groupBy<T extends Prisma.TodoGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? { orderBy: Prisma.UserGroupByArgs['orderBy'] } : { orderBy?: Prisma.UserGroupByArgs['orderBy'] }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.TupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True
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
        }[OrderFields]>(args: Prisma.SubsetIntersection<T, Prisma.TodoGroupByArgs, OrderByArg> & InputErrors, options?: RequestOptions<{} extends InputErrors ? Prisma.GetTodoGroupByPayload<T> : InputErrors>) {
        return request.get<{} extends InputErrors ? Prisma.GetTodoGroupByPayload<T> : InputErrors>(`${endpoint}/todo/groupBy`, args, options);
    }

    function count<T extends Prisma.TodoCountArgs>(args: Prisma.Subset<T, Prisma.TodoCountArgs>, options?: RequestOptions<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.TodoCountAggregateOutputType> : number>) {
        return request.get<T extends { select: any; } ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], Prisma.TodoCountAggregateOutputType> : number>(`${endpoint}/todo/count`, args, options);
    }
    return { create, createMany, findMany, findUnique, findFirst, update, updateMany, upsert, del, deleteMany, aggregate, groupBy, count };
}
