import type { NextPage } from 'next';
import LoginButton from '../components/LoginButton';
import { useSession } from 'next-auth/react';
import { useTodoList } from '@zenstack/hooks';
import { inviteUser } from '@zenstack/functions';
import { SpaceUserRole, TodoList } from '@zenstack/.prisma';

const Home: NextPage = () => {
    const { data: session } = useSession();
    const {
        create: createTodoList,
        find: findTodoList,
        del: deleteTodoList,
    } = useTodoList();
    const { data: todoLists } = findTodoList();

    async function onCreateTodoList() {
        await createTodoList({
            data: {
                title: 'My Todo List',
                ownerId: session!.user.id,
                spaceId: 'f0c9fc5c-e6e5-4146-a540-214f6ac5701c',
            },
        });
    }

    async function onCreateFilledTodoList() {
        await createTodoList({
            data: {
                title: 'My Todo List',
                ownerId: session!.user.id,
                spaceId: 'f0c9fc5c-e6e5-4146-a540-214f6ac5701c',
                todos: {
                    create: [
                        { title: 'First Todo', ownerId: session!.user.id },
                    ],
                },
            },
        });
    }

    async function onDeleteTodoList(todoList: TodoList) {
        await deleteTodoList(todoList.id);
    }

    async function onInviteUser() {
        await inviteUser(
            'f0c9fc5c-e6e5-4146-a540-214f6ac5701c',
            'dadd2e5b-d278-4695-8f6a-e6389bc109c0',
            SpaceUserRole.ADMIN
        );
    }

    function renderTodoLists() {
        return (
            <>
                <ul className="flex flex-col space-y-2">
                    {todoLists?.map((todoList) => (
                        <li key={todoList.id} className="flex space-x-2">
                            <h3 className="text-xl">{todoList.title}</h3>
                            <button
                                className="btn btn-secondary"
                                onClick={() => onDeleteTodoList(todoList)}
                            >
                                Del
                            </button>
                        </li>
                    ))}
                </ul>
            </>
        );
    }

    return (
        <div className="mt-8 text-center flex flex-col items-center space-y-4">
            <h1 className="text-3xl">Wonderful Todo</h1>
            <div className="container mt-4">
                <LoginButton />
            </div>

            {session && (
                <>
                    <button className="btn w-fit" onClick={onCreateTodoList}>
                        Create Todo List
                    </button>

                    <button
                        className="btn w-fit"
                        onClick={onCreateFilledTodoList}
                    >
                        Create Filled Todo List
                    </button>

                    <button className="btn w-fit" onClick={onInviteUser}>
                        Invite User
                    </button>

                    <h2 className="text-2xl">Todo Lists</h2>
                    {renderTodoLists()}
                </>
            )}
        </div>
    );
};

export default Home;
