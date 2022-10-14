import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import 'react-toastify/dist/ReactToastify.css';
import { ToastContainer } from 'react-toastify';
import NavBar from 'components/NavBar';
import {
    SpaceContext,
    useCurrentSpace,
    useCurrentUser,
    UserContext,
} from '@lib/context';
import AuthGuard from 'components/AuthGuard';

function AppContent(props: { children: JSX.Element | JSX.Element[] }) {
    const user = useCurrentUser();
    const space = useCurrentSpace();

    return (
        <AuthGuard>
            <UserContext.Provider value={user}>
                <SpaceContext.Provider value={space}>
                    <div className="h-screen flex flex-col">
                        <NavBar user={user} space={space} />
                        {props.children}
                    </div>
                </SpaceContext.Provider>
            </UserContext.Provider>
        </AuthGuard>
    );
}

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
    return (
        <SessionProvider session={session}>
            <AppContent>
                <div className="flex-grow h-100">
                    <Component {...pageProps} />
                    <ToastContainer
                        position="top-center"
                        autoClose={2000}
                        hideProgressBar={true}
                    />
                </div>
            </AppContent>
        </SessionProvider>
    );
}

export default MyApp;
