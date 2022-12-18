import { Space } from '@prisma/client';
import { User } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { createContext } from 'react';
import { trpc } from './trpc';

export const UserContext = createContext<User | undefined>(undefined);

export function useCurrentUser() {
    const { data: session } = useSession();
    return session?.user;
}

export const SpaceContext = createContext<Space | undefined>(undefined);

export function useCurrentSpace() {
    const router = useRouter();
    const { data: spaces } = trpc.space.findMany.useQuery(
        {
            where: {
                slug: router.query.slug as string,
            },
        },
        {
            enabled: !!router.query.slug,
        }
    );

    return spaces?.[0];
}
