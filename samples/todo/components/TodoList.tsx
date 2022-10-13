import Image from 'next/image';
import { List } from '@zenstackhq/runtime/types';
import { customAlphabet } from 'nanoid';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { User } from 'next-auth';
import Avatar from './Avatar';
import Link from 'next/link';
import { useRouter } from 'next/router';

type Props = {
    value: List & { owner: User };
};

export default function TodoList({ value }: Props) {
    const router = useRouter();
    return (
        <Link href={`${router.asPath}/${value.id}`}>
            <a className="card w-80 bg-base-100 shadow-xl cursor-pointer hover:bg-gray-50">
                <figure>
                    <Image
                        src={`https://picsum.photos/300/200?r=${customAlphabet(
                            '0123456789'
                        )(4)}`}
                        width={320}
                        height={200}
                        alt="Cover"
                    />
                </figure>
                <div className="card-body">
                    <h2 className="card-title line-clamp-1">
                        {value.title || 'Missing Title'}
                    </h2>
                    <div className="card-actions justify-end">
                        <Avatar user={value.owner} size={18} />
                        {value.private && (
                            <div className="tooltip" data-tip="Private">
                                <LockClosedIcon className="w-4 h-4 text-gray-500" />
                            </div>
                        )}
                    </div>
                </div>
            </a>
        </Link>
    );
}
