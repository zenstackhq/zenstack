import { UserIcon } from '@heroicons/react/24/outline';
import { User } from 'next-auth';
import Image from 'next/image';

type Props = {
    user: User;
    size?: number;
};

export default function Avatar({ user, size }: Props) {
    return (
        <div className="tooltip" data-tip={user.name || user.email}>
            <Image
                src={user.image || '/avatar.jpg'}
                alt="avatar"
                width={size || 32}
                height={size || 32}
                className="rounded-full"
            />
        </div>
    );
}
