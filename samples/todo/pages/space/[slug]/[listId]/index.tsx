import { PlusIcon } from '@heroicons/react/24/outline';
import { useCurrentUser } from '@lib/context';
import { trpc } from '@lib/trpc';
import { List, Space, Todo, User } from '@prisma/client';
import BreadCrumb from 'components/BreadCrumb';
import TodoComponent from 'components/Todo';
import WithNavBar from 'components/WithNavBar';
import { GetServerSideProps } from 'next';
import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { toast } from 'react-toastify';
import { withAuth } from 'server/db/auth';

type Props = {
    space: Space;
    list: List;
    todos: (Todo & { owner: User })[];
};

export default function TodoList(props: Props) {
    const user = useCurrentUser();
    const [title, setTitle] = useState('');

    const { data: todos, refetch } = trpc.todo.findMany.useQuery<Props['todos'], Props['todos']>(
        {
            where: { listId: props.list.id },
            include: {
                owner: true,
            },
            orderBy: {
                updatedAt: 'desc',
            },
        },
        { initialData: props.todos, enabled: !!props.list }
    );

    const { mutateAsync: createTodo } = trpc.todo.create.useMutation();

    const _createTodo = async () => {
        try {
            const todo = await createTodo({
                data: {
                    title,
                    owner: { connect: { id: user!.id } },
                    list: { connect: { id: props.list.id } },
                },
            });
            console.log(`Todo created: ${todo}`);
            setTitle('');
            refetch();
        } catch (err: any) {
            toast.error(`Failed to create todo: ${err.info?.message || err.message}`);
        }
    };

    if (!props.space || !props.list) {
        return <></>;
    }

    return (
        <WithNavBar>
            <div className="px-8 py-2">
                <BreadCrumb space={props.space} list={props.list} />
            </div>
            <div className="container w-full flex flex-col items-center pt-12">
                <h1 className="text-2xl font-semibold mb-4">{props.list?.title}</h1>
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
                                refetch();
                            }}
                            deleted={() => {
                                refetch();
                            }}
                        />
                    ))}
                </ul>
            </div>
        </WithNavBar>
    );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params }) => {
    const db = await withAuth({ req, res });
    const space = await db.space.findUnique({
        where: { slug: params!.slug as string },
    });
    if (!space) {
        return {
            notFound: true,
        };
    }

    const list = await db.list.findUnique({
        where: { id: params!.listId as string },
    });
    if (!list) {
        return {
            notFound: true,
        };
    }

    const todos = await db.todo.findMany({
        where: { listId: params?.listId as string },
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
