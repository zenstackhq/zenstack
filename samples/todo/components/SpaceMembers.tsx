import { useSpaceUser } from '@zenstackhq/runtime/hooks';
import { useCurrentSpace } from '@lib/context';
import { PlusIcon } from '@heroicons/react/24/outline';
import Avatar from './Avatar';
import ManageMembers from './ManageMembers';
import { Space } from '@zenstackhq/runtime/types';

function ManagementDialog(space?: Space) {
    if (!space) return undefined;
    return (
        <>
            <label htmlFor="management-modal" className="modal-button">
                <PlusIcon className="w-6 h-6 text-gray-500 cursor-pointer mr-1" />
            </label>

            <input
                type="checkbox"
                id="management-modal"
                className="modal-toggle"
            />
            <div className="modal">
                <div className="modal-box">
                    <h3 className="font-bold text-base md:text-lg">
                        Manage Members of {space.name}
                    </h3>

                    <div className="p-4 mt-4">
                        <ManageMembers space={space} />
                    </div>

                    <div className="modal-action">
                        <label
                            htmlFor="management-modal"
                            className="btn btn-outline"
                        >
                            Close
                        </label>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function SpaceMembers() {
    const space = useCurrentSpace();

    const { find: findMembers } = useSpaceUser();
    const { data: members } = findMembers({
        where: {
            spaceId: space?.id,
        },
        include: {
            user: true,
        },
        orderBy: {
            role: 'desc',
        },
    });

    return (
        <div className="flex items-center">
            {ManagementDialog(space)}
            {members && (
                <label
                    className="mr-1 modal-button cursor-pointer"
                    htmlFor="management-modal"
                >
                    {members?.map((member) => (
                        <Avatar key={member.id} user={member.user} size={24} />
                    ))}
                </label>
            )}
        </div>
    );
}
