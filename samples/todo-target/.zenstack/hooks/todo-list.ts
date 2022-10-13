import { useSWRConfig } from 'swr';
import type { Prisma, TodoList } from '../.prisma';
import { put, del as _del, post, swr } from './request';

const base = '/api/zen/data/todoList';

export function useTodoList() {
    const { mutate } = useSWRConfig();

    async function create<T extends Prisma.TodoListCreateArgs>(
        data: Prisma.TodoListCreateArgs
    ) {
        return post<
            Prisma.TodoListCreateArgs,
            Prisma.CheckSelect<T, TodoList, Prisma.TodoListGetPayload<T>>
        >(base, data, mutate);
    }

    function find<T extends Prisma.TodoListFindManyArgs>(
        args?: Prisma.SelectSubset<T, Prisma.TodoListFindManyArgs>
    ) {
        let endpoint = base;
        if (args) {
            endpoint += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }
        return swr<
            Prisma.CheckSelect<
                T,
                Array<TodoList>,
                Array<Prisma.TodoListGetPayload<T>>
            >
        >(endpoint);
    }

    function get<
        T extends Pick<Prisma.TodoListFindManyArgs, 'select' | 'include'>
    >(
        id: string,
        args?: Prisma.SelectSubset<
            T,
            Pick<Prisma.TodoListFindManyArgs, 'select' | 'include'>
        >
    ) {
        let endpoint = `${base}/${id}`;
        if (args) {
            endpoint += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }
        return swr<
            Prisma.CheckSelect<T, TodoList, Prisma.TodoListGetPayload<T>>
        >(endpoint);
    }

    async function update<T extends Omit<Prisma.TodoListUpdateArgs, 'where'>>(
        id: string,
        data: Omit<Prisma.TodoListUpdateArgs, 'where'>
    ) {
        const payload = {
            ...data,
            where: { id },
        };
        return put<
            Prisma.TodoListUpdateArgs,
            Prisma.CheckSelect<T, TodoList, Prisma.TodoListGetPayload<T>>
        >(`${base}/batch`, payload, mutate);
    }

    async function del<T extends Omit<Prisma.TodoListDeleteArgs, 'where'>>(
        id: string,
        args?: Omit<Prisma.TodoListDeleteArgs, 'where'>
    ) {
        let url = `${base}/${id}`;
        if (args) {
            url += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }

        return _del<
            Prisma.CheckSelect<T, TodoList, Prisma.TodoListGetPayload<T>>
        >(url, mutate);
    }

    return { create, find, get, update, del };
}
