import type { AppProps } from 'next/app';
import { trpc } from '../lib/trpc';

function App({ Component, pageProps }: AppProps) {
    return <Component {...pageProps} />;
}

export default trpc.withTRPC(App);
