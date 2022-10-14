import type { NextPage } from 'next';
import { useSession, signIn } from 'next-auth/react';
import Spaces from 'components/Spaces';
import Link from 'next/link';

const Home: NextPage = () => {
    const { data: session, status: sessionStatus } = useSession();

    if (sessionStatus === 'unauthenticated') {
        // kick back to signin
        signIn();
    }

    if (!session) {
        return <div>Loading ...</div>;
    }

    return (
        <>
            <div className="mt-8 text-center flex flex-col items-center w-full">
                <h1 className="text-2xl text-gray-800">
                    Welcome {session.user.name || session.user.email}!
                </h1>
                <div className="w-full p-8">
                    <h2 className="text-xl text-left mb-8 text-gray-700">
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
        </>
    );
};

export default Home;
