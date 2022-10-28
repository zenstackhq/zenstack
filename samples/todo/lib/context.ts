import { useSpace } from '@zenstackhq/runtime/hooks';
import { Space } from '@zenstackhq/runtime/types';
import { User } from 'next-auth';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { createContext } from 'react';

export const UserContext = createContext<User | undefined>(undefined);

export function useCurrentUser() {
    const { data: session } = useSession();
    return session?.user;
}

export const SpaceContext = createContext<Space | undefined>(undefined);

export function useCurrentSpace() {
    const router = useRouter();
    const { find } = useSpace();
    const spaces = find({
        where: {
            slug: router.query.slug as string,
        },
    });

    if (!router.query.slug) {
        return undefined;
    }

    return spaces.data?.[0];
}
