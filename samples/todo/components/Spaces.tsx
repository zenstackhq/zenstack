import { Space } from '@prisma/client';
import Link from 'next/link';

type Props = {
    spaces: Space[];
};

export default function Spaces({ spaces }: Props) {
    return (
        <ul className="flex flex-wrap gap-4">
            {spaces?.map((space) => (
                <li
                    className="card w-80 h-32 shadow-xl text-gray-600 cursor-pointer hover:bg-gray-50 border"
                    key={space.id}
                >
                    <Link href={`/space/${space.slug}`}>
                        <a>
                            <div className="card-body" title={space.name}>
                                <h2 className="card-title line-clamp-1">{space.name}</h2>
                            </div>
                        </a>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
