import type { NextPage } from 'next';
import Spaces from 'components/Spaces';
import Link from 'next/link';
import { useCurrentUser } from '@lib/context';

const Home: NextPage = () => {
    const user = useCurrentUser();
    return (
        <>
            {user && (
                <div className="mt-8 text-center flex flex-col items-center w-full">
                    <h1 className="text-2xl text-gray-800">
                        Welcome {user.name || user.email}!
                    </h1>
                    <div className="w-full p-8">
                        <h2 className="text-lg md:text-xl text-left mb-8 text-gray-700">
                            Choose a space to start, or{' '}
                            <Link href="/create-space">
                                <a className="link link-primary">
                                    create a new one.
                                </a>
                            </Link>
                        </h2>
                        <Spaces />
                    </div>
                </div>
            )}
        </>
    );
};

export default Home;
