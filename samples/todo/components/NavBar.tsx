import Image from 'next/image';
import Avatar from './Avatar';
import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { Space } from '@zenstackhq/runtime/types';
import { User } from 'next-auth';

type Props = {
    space: Space | undefined;
    user: User | undefined;
};

export default function NavBar({ user, space }: Props) {
    return (
        <div className="navbar bg-base-100 px-8 py-2 border-b">
            <div className="flex-1">
                <Link href="/">
                    <a className="flex items-center">
                        <Image
                            src="/logo.png"
                            alt="Logo"
                            width={32}
                            height={32}
                        />
                        <div className="text-xl font-semibold ml-2 text-slate-700 hidden md:inline-block">
                            {space?.name || 'Welcome Todo App'}
                        </div>
                        <p className="text-xs ml-2 text-gray-500 self-end">
                            Powered by ZenStack
                        </p>
                    </a>
                </Link>
            </div>
            <div className="flex-none">
                <div className="dropdown dropdown-end">
                    <label
                        tabIndex={0}
                        className="btn btn-ghost btn-circle avatar"
                    >
                        {user && <Avatar user={user!} />}
                    </label>
                    <ul
                        tabIndex={0}
                        className="menu menu-compact dropdown-content mt-3 p-2 shadow bg-base-100 rounded-box w-52"
                    >
                        <li className="border-b border-gray-200">
                            {user && <div>{user.name || user.email}</div>}
                        </li>
                        <li>
                            <a onClick={() => signOut()}>Logout</a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
