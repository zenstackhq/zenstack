import { authOptions } from '@api/auth/[...nextauth]';
import { useTodo } from '@zenstackhq/runtime/client';
import { PlusIcon } from '@heroicons/react/24/outline';
import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { useCurrentUser } from '@lib/context';
import TodoComponent from 'components/Todo';
import BreadCrumb from 'components/BreadCrumb';
import WithNavBar from 'components/WithNavBar';
import { List, Space, Todo, User } from '@zenstackhq/runtime/types';
import { GetServerSideProps } from 'next';
import { unstable_getServerSession } from 'next-auth';
import service from '@zenstackhq/runtime/server';
import { getSpaceBySlug } from '@lib/query-utils';

type Props = {
    space: Space;
    list: List;
    todos: (Todo & { owner: User })[];
};

export default function TodoList(props: Props) {
    const user = useCurrentUser();
    const { create: createTodo, find: findTodos } = useTodo();
    const [title, setTitle] = useState('');

    const { data: todos, mutate: invalidateTodos } = findTodos(
        {
            where: {
                listId: props.list.id,
            },
            include: {
                owner: true,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        },
        { initialData: props.todos }
    );

    const _createTodo = async () => {
        const todo = await createTodo({
            data: {
                title,
                ownerId: user!.id,
                listId: props.list.id,
            },
        });
        console.log(`Todo created: ${todo}`);
        setTitle('');
    };

    return (
        <WithNavBar>
            <div className="px-8 py-2">
                <BreadCrumb space={props.space} list={props.list} />
            </div>
            <div className="container w-full flex flex-col items-center pt-12">
                <h1 className="text-2xl font-semibold mb-4">
                    {props.list?.title}
                </h1>
                <div className="flex space-x-2">
                    <input
                        type="text"
                        placeholder="Type a title and press enter"
                        className="input input-bordered w-72 max-w-xs mt-2"
                        value={title}
                        onKeyUp={(e: KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === 'Enter') {
                                _createTodo();
                            }
                        }}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            setTitle(e.currentTarget.value);
                        }}
                    />
                    <button onClick={() => _createTodo()}>
                        <PlusIcon className="w-6 h-6 text-gray-500" />
                    </button>
                </div>
                <ul className="flex flex-col space-y-4 py-8 w-11/12 md:w-auto">
                    {todos?.map((todo) => (
                        <TodoComponent
                            key={todo.id}
                            value={todo}
                            updated={() => {
                                invalidateTodos();
                            }}
                            deleted={() => {
                                invalidateTodos();
                            }}
                        />
                    ))}
                </ul>
            </div>
        </WithNavBar>
    );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
    req,
    res,
    params,
}) => {
    const session = await unstable_getServerSession(req, res, authOptions);
    const queryContext = { user: session?.user };

    const space = await getSpaceBySlug(queryContext, params?.slug as string);

    const list = await service.list.get(queryContext, params?.listId as string);

    const todos = await service.todo.find(queryContext, {
        where: {
            listId: params?.id as string,
        },
        include: {
            owner: true,
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });

    return {
        props: { space, list, todos },
    };
};
