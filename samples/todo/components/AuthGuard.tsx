import { signIn, useSession } from 'next-auth/react';

type Props = {
    children: JSX.Element | JSX.Element[];
};

export default function AuthGuard({ children }: Props) {
    const { status } = useSession();
    if (status === 'loading') {
        return <p>Loading...</p>;
    } else if (status === 'unauthenticated') {
        signIn();
        return <></>;
    } else {
        return <>{children}</>;
    }
}
