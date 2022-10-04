import { useSWRConfig } from 'swr';
import {
    TodoListCreateArgs,
    TodoListCreateResult,
    TodoListDeleteArgs,
    TodoListFindArgs,
    TodoListFindArgsInput,
    TodoListFindResult,
    TodoListGetArgs,
    TodoListGetArgsInput,
    TodoListUpdateArgs,
    TodoListUpdateResult,
} from '../types';
import { put, del as _del, post, swr } from './request';

const base = '/api/zen/data/todoList';

export function useTodoList() {
    const { mutate } = useSWRConfig();

    async function create<T extends TodoListCreateArgs>(
        data: TodoListCreateArgs
    ) {
        return post<TodoListCreateArgs, TodoListCreateResult<T>>(
            base,
            data,
            mutate
        );
    }

    function find<T extends TodoListFindArgsInput>(args?: TodoListFindArgs<T>) {
        let endpoint = base;
        if (args) {
            endpoint += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }
        return swr<TodoListFindResult<T>>(endpoint);
    }

    function get<T extends TodoListGetArgsInput>(
        id: string,
        args?: TodoListGetArgs<T>
    ) {
        let endpoint = `${base}/${id}`;
        if (args) {
            endpoint += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }
        return swr<TodoListFindResult<T>>(endpoint);
    }

    async function update<T extends TodoListUpdateArgs>(
        id: string,
        data: TodoListUpdateArgs
    ) {
        return put<TodoListUpdateArgs, TodoListUpdateResult<T>>(
            `${base}/batch`,
            data,
            mutate
        );
    }

    async function del(id: string, args?: TodoListDeleteArgs) {
        let url = `${base}/${id}`;
        if (args) {
            url += `?q=${encodeURIComponent(JSON.stringify(args))}`;
        }
        return _del(url, mutate);
    }

    return { create, find, get, update, del };
}
