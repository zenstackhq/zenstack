import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useCurrentUser } from '@lib/context';
import { ServerErrorCode } from '@zenstackhq/internal';
import { HooksError, useSpaceUser } from '@zenstackhq/runtime/hooks';
import { Space, SpaceUserRole } from '@zenstackhq/runtime/types';
import { ChangeEvent, KeyboardEvent, useState } from 'react';
import { toast } from 'react-toastify';
import Avatar from './Avatar';

type Props = {
    space: Space;
};

export default function ManageMembers({ space }: Props) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<SpaceUserRole>(SpaceUserRole.USER);
    const user = useCurrentUser();

    const { find, create: addMember, del: delMember } = useSpaceUser();
    const { data: members } = find({
        where: {
            spaceId: space.id,
        },
        include: {
            user: true,
        },
    });

    const inviteUser = async () => {
        try {
            const r = await addMember({
                data: {
                    user: {
                        connect: {
                            email,
                        },
                    },
                    space: {
                        connect: {
                            id: space.id,
                        },
                    },
                    role,
                },
            });
            console.log('SpaceUser created:', r);
        } catch (err: any) {
            console.error(JSON.stringify(err));
            if (err.info?.code) {
                const { info } = err as HooksError;
                if (info.code === ServerErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
                    toast.error('User is already a member of the space');
                } else if (
                    info.code === ServerErrorCode.REFERENCE_CONSTRAINT_VIOLATION
                ) {
                    toast.error('User is not found for this email');
                }
            } else {
                toast.error(`Error occurred: ${err}`);
            }
        }
    };

    const removeMember = async (id: string) => {
        if (confirm(`Are you sure to remove this member from space?`)) {
            await delMember(id);
        }
    };

    return (
        <div>
            <div className="flex flex-wrap gap-2 items-center mb-8 w-full">
                <input
                    type="text"
                    placeholder="Type user email and enter to invite"
                    className="input input-sm input-bordered flex-grow mr-2"
                    value={email}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setEmail(e.currentTarget.value);
                    }}
                    onKeyUp={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                            inviteUser();
                        }
                    }}
                />

                <select
                    className="select select-sm mr-2"
                    value={role}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                        setRole(e.currentTarget.value as SpaceUserRole);
                    }}
                >
                    <option value={SpaceUserRole.USER}>USER</option>
                    <option value={SpaceUserRole.ADMIN}>ADMIN</option>
                </select>

                <button>
                    <PlusIcon className="w-6 h-6 text-gray-500" />
                </button>
            </div>

            <ul className="space-y-2">
                {members?.map((member) => (
                    <li
                        key={member.id}
                        className="flex flex-wrap w-full justify-between"
                    >
                        <div className="flex items-center">
                            <div className="hidden md:block mr-2">
                                <Avatar user={member.user} size={32} />
                            </div>
                            <p className="w-36 md:w-48 line-clamp-1 mr-2">
                                {member.user.name || member.user.email}
                            </p>
                            <p>{member.role}</p>
                        </div>
                        <div className="flex items-center">
                            {user?.id !== member.user.id && (
                                <TrashIcon
                                    className="w-4 h-4 text-gray-500"
                                    onClick={() => {
                                        removeMember(member.id);
                                    }}
                                />
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
