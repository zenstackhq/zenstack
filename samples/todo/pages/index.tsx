import { authOptions } from '@api/auth/[...nextauth]';
import { useCurrentUser } from '@lib/context';
import service from '@zenstackhq/runtime/server';
import { Space } from '@zenstackhq/runtime/types';
import Spaces from 'components/Spaces';
import WithNavBar from 'components/WithNavBar';
import type { GetServerSideProps, NextPage } from 'next';
import { unstable_getServerSession } from 'next-auth';
import Link from 'next/link';

type Props = {
    spaces: Space[];
};

const Home: NextPage<Props> = ({ spaces }) => {
    const user = useCurrentUser();
    return (
        <WithNavBar>
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
                        <Spaces spaces={spaces} />
                    </div>
                </div>
            )}
        </WithNavBar>
    );
};

export const getServerSideProps: GetServerSideProps<Props> = async ({
    req,
    res,
}) => {
    const session = await unstable_getServerSession(req, res, authOptions);
    const spaces = await service.space.find({ user: session?.user });
    return {
        props: { spaces },
    };
};

export default Home;
