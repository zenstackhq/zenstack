import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useCurrentUser } from '@lib/context';
import { isTRPCClientError, trpc } from '@lib/trpc';
import { Space, SpaceUser, SpaceUserRole, User } from '@prisma/client';
import { inferProcedureOutput } from '@trpc/server';
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

    const { data: members } = trpc.spaceUser.findMany.useQuery<
        inferProcedureOutput<typeof trpc.spaceUser.findMany>,
        // a cast is needed because trpc's procedure typing is static
        (SpaceUser & { user: User })[]
    >({
        where: {
            spaceId: space.id,
        },
        include: {
            user: true,
        },
        orderBy: {
            role: 'desc',
        },
    });

    const { mutateAsync: addMember } = trpc.spaceUser.create.useMutation();
    const { mutateAsync: delMember } = trpc.spaceUser.delete.useMutation();

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
            console.error(err);
            if (isTRPCClientError(err) && err.data?.prismaError) {
                console.error('PrismaError:', err.data.prismaError);
                if (err.data.prismaError.code === 'P2002') {
                    toast.error('User is already a member of the space');
                } else if (err.data.prismaError.code === 'P2025') {
                    toast.error('User is not found for this email');
                } else {
                    toast.error(`Unexpected Prisma error: ${err.data.prismaError.code}`);
                }
            } else {
                toast.error(`Error occurred: ${JSON.stringify(err)}`);
            }
        }
    };

    const removeMember = async (id: string) => {
        if (confirm(`Are you sure to remove this member from space?`)) {
            await delMember({ where: { id } });
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

                <button onClick={() => inviteUser()}>
                    <PlusIcon className="w-6 h-6 text-gray-500" />
                </button>
            </div>

            <ul className="space-y-2">
                {members?.map((member) => (
                    <li key={member.id} className="flex flex-wrap w-full justify-between">
                        <div className="flex items-center">
                            <div className="hidden md:block mr-2">
                                <Avatar user={member.user} size={32} />
                            </div>
                            <p className="w-36 md:w-48 line-clamp-1 mr-2">{member.user.name || member.user.email}</p>
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
