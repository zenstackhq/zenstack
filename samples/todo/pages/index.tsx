import type { NextPage } from 'next';
import LoginButton from '../components/LoginButton';
import { useSession } from 'next-auth/react';
import { useTodoCollection } from '@zenstackhq/generated/hooks';
import { TodoCollection } from '@zenstackhq/generated/types';

const Home: NextPage = () => {
    const { data: session } = useSession();
    const {
        create: createTodoCollection,
        find: findTodoCollection,
        del: deleteTodoCollection,
    } = useTodoCollection();
    const { data: todoCollections } = findTodoCollection();

    async function onCreateTodoCollection() {
        await createTodoCollection({
            data: {
                title: 'My Todo Collection',
                ownerId: session!.user.id,
                spaceId: 'f0c9fc5c-e6e5-4146-a540-214f6ac5701c',
            },
        });
    }

    async function onCreateFilledTodoCollection() {
        await createTodoCollection({
            data: {
                title: 'My Todo Collection',
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

    async function onDeleteTodoCollection(todoList: TodoCollection) {
        await deleteTodoCollection(todoList.id);
    }

    function renderTodoCollections() {
        return (
            <>
                <ul className="flex flex-col space-y-2">
                    {todoCollections?.map((collection) => (
                        <li key={collection.id} className="flex space-x-2">
                            <h3 className="text-xl">{collection.title}</h3>
                            <button
                                className="btn btn-secondary"
                                onClick={() =>
                                    onDeleteTodoCollection(collection)
                                }
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
                    <button
                        className="btn w-fit"
                        onClick={onCreateTodoCollection}
                    >
                        Create Todo List
                    </button>

                    <button
                        className="btn w-fit"
                        onClick={onCreateFilledTodoCollection}
                    >
                        Create Filled Todo List
                    </button>

                    <h2 className="text-2xl">Todo Lists</h2>
                    {renderTodoCollections()}
                </>
            )}
        </div>
    );
};

export default Home;
