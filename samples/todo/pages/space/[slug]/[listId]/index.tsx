import { useList, useTodo } from '@zenstackhq/runtime/hooks';
import { useRouter } from 'next/router';
import { PlusIcon } from '@heroicons/react/24/outline';
import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { useCurrentUser } from '@lib/context';
import TodoComponent from 'components/Todo';
import BreadCrumb from 'components/BreadCrumb';

export default function TodoList() {
    const user = useCurrentUser();
    const router = useRouter();
    const { get: getList } = useList();
    const { create: createTodo, find: findTodos } = useTodo();
    const [title, setTitle] = useState('');

    const { data: list } = getList(router.query.listId as string);
    const { data: todos, mutate: invalidateTodos } = findTodos({
        where: {
            listId: list?.id,
        },
        include: {
            owner: true,
        },
        orderBy: {
            updatedAt: 'desc',
        },
    });

    if (!list) {
        return <p>Loading ...</p>;
    }

    const _createTodo = async () => {
        const todo = await createTodo({
            data: {
                title,
                ownerId: user!.id,
                listId: list!.id,
            },
        });
        console.log(`Todo created: ${todo}`);
        setTitle('');
    };

    return (
        <>
            <div className="px-8 py-2">
                <BreadCrumb />
            </div>
            <div className="container w-full flex flex-col items-center pt-12">
                <h1 className="text-2xl font-semibold mb-4">{list?.title}</h1>
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
        </>
    );
}
