import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';

type Props = {
    children: JSX.Element | JSX.Element[];
};

export default function AuthGuard({ children }: Props) {
    const { status } = useSession();
    const router = useRouter();

    if (router.pathname === '/signup' || router.pathname === '/signin') {
        return <>{children}</>;
    }

    if (status === 'loading') {
        return <p>Loading...</p>;
    } else if (status === 'unauthenticated') {
        router.push('/signin');
        return <></>;
    } else {
        return <>{children}</>;
    }
}
