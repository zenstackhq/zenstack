'use client';

import { useState } from 'react';

import { api } from '~/trpc/react';
import styles from '../index.module.css';

export function LatestPost() {
    const { data: latestPost } = api.post.findFirst.useQuery(
        {
            orderBy: { createdAt: 'desc' },
            include: { author: true },
        },
        { staleTime: 1000 * 60 }
    );

    const [latestPost1] = api.post.findFirst.useSuspenseQuery(
        {
            orderBy: { createdAt: 'desc' },
            include: { author: true },
        },
        { staleTime: 1000 * 60 }
    );
    console.log(latestPost1.author.email);

    api.post.findMany.useInfiniteQuery(
        {
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: { author: true },
        },
        {
            getNextPageParam: (lastPage) => ({
                id: lastPage?.[lastPage.length - 1]?.id,
            }),
        }
    );

    const utils = api.useUtils();
    const [name, setName] = useState('');
    const createPost = api.post.create.useMutation({
        onSuccess: async () => {
            await utils.post.invalidate();
            setName('');
        },
    });

    return (
        <div className={styles.showcaseContainer}>
            {latestPost ? (
                <p className={styles.showcaseText}>
                    Your most recent post: {latestPost.name} by {latestPost.author.email}
                </p>
            ) : (
                <p className={styles.showcaseText}>You have no posts yet.</p>
            )}

            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    createPost.mutate({ data: { name, author: { connect: { id: 1 } } } });
                }}
                className={styles.form}
            >
                <input
                    type="text"
                    placeholder="Title"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={styles.input}
                />
                <button type="submit" className={styles.submitButton} disabled={createPost.isPending}>
                    {createPost.isPending ? 'Submitting...' : 'Submit'}
                </button>
            </form>
        </div>
    );
}
