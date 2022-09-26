import { useSession, signIn, signOut } from 'next-auth/react';

export default function Component() {
    const { data: session } = useSession();
    if (session) {
        return (
            <>
                <div className="mb-2">Signed in as {session.user?.email}</div>
                <button className="btn btn-primary" onClick={() => signOut()}>
                    Sign out
                </button>
            </>
        );
    }
    return (
        <>
            <button className="btn btn-primary" onClick={() => signIn()}>
                Sign in
            </button>
        </>
    );
}
