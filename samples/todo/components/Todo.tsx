import { TrashIcon } from '@heroicons/react/24/outline';
import { useTodo } from '@zenstackhq/runtime/hooks';
import { Todo, User } from '@zenstackhq/runtime/types';
import { ChangeEvent, useEffect, useState } from 'react';
import Avatar from './Avatar';
import TimeInfo from './TimeInfo';

type Props = {
    value: Todo & { owner: User };
    updated?: (value: Todo) => any;
    deleted?: (value: Todo) => any;
};

export default function Component({ value, updated, deleted }: Props) {
    const [completed, setCompleted] = useState(!!value.completedAt);
    const { update, del } = useTodo();

    useEffect(() => {
        if (!!value.completedAt !== completed) {
            update(value.id, {
                data: { completedAt: completed ? new Date() : null },
            }).then((newValue) => {
                if (updated && newValue) {
                    updated(newValue);
                }
            });
        }
    });

    const deleteTodo = async () => {
        await del(value.id);
        if (deleted) {
            deleted(value);
        }
    };

    return (
        <div className="border rounded-lg px-8 py-4 shadow-lg flex flex-col items-center w-full lg:w-[480px]">
            <div className="flex justify-between w-full mb-4">
                <h3
                    className={`text-xl line-clamp-1 ${
                        value.completedAt
                            ? 'line-through text-gray-400 italic'
                            : 'text-gray-700'
                    }`}
                >
                    {value.title}
                </h3>
                <div className="flex">
                    <input
                        type="checkbox"
                        className="checkbox mr-2"
                        checked={completed}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            setCompleted(e.currentTarget.checked)
                        }
                    />
                    <TrashIcon
                        className="w-6 h-6 text-gray-500 cursor-pointer"
                        onClick={() => {
                            deleteTodo();
                        }}
                    />
                </div>
            </div>
            <div className="flex justify-end w-full space-x-2">
                <TimeInfo value={value} />
                <Avatar user={value.owner} size={18} />
            </div>
        </div>
    );
}
