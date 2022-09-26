import type {
    Prisma as P,
    PrismaClient,
    TodoList as _TodoList,
} from './.prisma';

export type TodoList = _TodoList;

export type TodoListCreateArgs = P.TodoListCreateArgs;
export type TodoListCreateResult<T extends TodoListCreateArgs> = P.CheckSelect<
    T,
    TodoList,
    P.TodoListGetPayload<T>
>;

export type TodoListFindArgsInput = P.TodoListFindManyArgs;
export type TodoListFindArgs<T extends TodoListFindArgsInput> = P.SelectSubset<
    T,
    TodoListFindArgsInput
>;
export type TodoListFindResult<T extends TodoListFindArgsInput> = P.CheckSelect<
    T,
    Array<TodoList>,
    Array<P.TodoListGetPayload<T>>
>;

export type TodoListGetArgsInput = Pick<
    TodoListFindArgsInput,
    'select' | 'include'
>;
export type TodoListGetArgs<T extends TodoListGetArgsInput> = P.SelectSubset<
    T,
    TodoListGetArgsInput
>;

export type TodoListUpdateArgs = P.TodoListUpdateArgs;
export type TodoListUpdateResult<T extends TodoListUpdateArgs> = P.CheckSelect<
    T,
    TodoList,
    P.TodoListGetPayload<T>
>;

export type TodoListDeleteArgs = P.TodoListDeleteArgs;
export type TodoListDeleteResult<T extends TodoListDeleteArgs> = P.CheckSelect<
    T,
    TodoList,
    P.TodoListGetPayload<T>
>;

export type FunctionContext = {
    db: PrismaClient;
    user?: { id: string } | null;
};
