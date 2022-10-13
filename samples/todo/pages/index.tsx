import type { NextPage } from 'next';
import { useSession, signIn } from 'next-auth/react';
import { useTodoCollection } from '@zenstackhq/runtime/hooks';
import { TodoCollection } from '@zenstackhq/runtime/types';
import Spaces from 'components/Spaces';
import Link from 'next/link';

const Home: NextPage = () => {
    const { data: session, status: sessionStatus } = useSession();

    if (sessionStatus === 'unauthenticated') {
        // kick back to signin
        signIn();
    }

    // const {
    //     create: createTodoCollection,
    //     find: findTodoCollection,
    //     del: deleteTodoCollection,
    // } = useTodoCollection();

    // const { data: todoCollections } = findTodoCollection();

    // async function onCreateTodoCollection() {
    //     await createTodoCollection({
    //         data: {
    //             title: 'My Todo Collection',
    //             ownerId: session!.user.id,
    //             spaceId: 'f0c9fc5c-e6e5-4146-a540-214f6ac5701c',
    //         },
    //     });
    // }

    // async function onCreateFilledTodoCollection() {
    //     await createTodoCollection({
    //         data: {
    //             title: 'My Todo Collection',
    //             ownerId: session!.user.id,
    //             spaceId: 'f0c9fc5c-e6e5-4146-a540-214f6ac5701c',
    //             todos: {
    //                 create: [
    //                     { title: 'First Todo', ownerId: session!.user.id },
    //                 ],
    //             },
    //         },
    //     });
    // }

    // async function onDeleteTodoCollection(todoList: TodoCollection) {
    //     await deleteTodoCollection(todoList.id);
    // }

    // function renderTodoCollections() {
    //     return (
    //         <>
    //             <ul className="flex flex-col space-y-2">
    //                 {todoCollections?.map((collection) => (
    //                     <li key={collection.id} className="flex space-x-2">
    //                         <h3 className="text-xl">{collection.title}</h3>
    //                         <button
    //                             className="btn btn-secondary"
    //                             onClick={() =>
    //                                 onDeleteTodoCollection(collection)
    //                             }
    //                         >
    //                             Del
    //                         </button>
    //                     </li>
    //                 ))}
    //             </ul>
    //         </>
    //     );
    // }

    if (!session) {
        return <div>Loading ...</div>;
    }

    return (
        <>
            <div className="mt-8 text-center flex flex-col items-center w-full">
                <h1 className="text-2xl text-gray-800">
                    Welcome {session.user.name || session.user.email}!
                </h1>
                <div className="w-full p-8">
                    <h2 className="text-xl text-left mb-8 text-gray-700">
                        Choose a space to start, or{' '}
                        <Link href="/create-space">
                            <a className="link link-primary">
                                create a new one.
                            </a>
                        </Link>
                    </h2>
                    <Spaces />
                </div>
                {/* <button
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
                        {renderTodoCollections()} */}
            </div>
        </>
    );
};

export default Home;
