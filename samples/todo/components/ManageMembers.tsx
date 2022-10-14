import { PlusIcon } from '@heroicons/react/24/outline';
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

    const { find, create: addMember } = useSpaceUser();
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

    return (
        <div>
            <div className="flex items-center mb-8 w-full">
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
                    <option value={SpaceUserRole.USER}>Member</option>
                    <option value={SpaceUserRole.ADMIN}>Admin</option>
                </select>

                <button>
                    <PlusIcon className="w-6 h-6 text-gray-500" />
                </button>
            </div>

            <ul className="space-y-2">
                {members?.map((member) => (
                    <li key={member.id} className="flex w-full justify-between">
                        <div className="flex items-center space-x-4">
                            <Avatar user={member.user} size={32} />
                            <p className="w-48 line-clamp-1">
                                {member.user.name || member.user.email}
                            </p>
                            <p>{member.role}</p>
                        </div>
                        <div className="flex items-center">
                            <button className="justify-self-end btn btn-link btn-xs text-gray-500">
                                Remove
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
