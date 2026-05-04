<script setup lang="ts">
import { $filter, $get, $map, $stepRef } from '@zenstackhq/orm';
import { useClientQueries, type FetchFn } from '@zenstackhq/tanstack-query/vue';
import { LoremIpsum } from 'lorem-ipsum';
import { ref } from 'vue';
import type { Post, User } from '../../zenstack/models';
import { schema } from '../../zenstack/schema-lite';

const lorem = new LoremIpsum({ wordsPerSentence: { max: 6, min: 4 } });

type TransactionBatchResult = [User, Post, Post, Post[], unknown, Post[]];

const showPublishedOnly = ref(false);
const enableFetch = ref(true);
const optimistic = ref(false);
const transactionMessage = ref('');
const transactionSucceeded = ref(false);

const fetch: FetchFn = async (url, init) => {
    // simulate a delay for showing optimistic update effect
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return globalThis.fetch(url, init);
};

const clientQueries = useClientQueries(schema, { fetch, logging: true });
const { data: users, isFetched: isUsersFetched } = clientQueries.user.useFindMany();

const { data: posts } = clientQueries.post.useFindMany(
    () => ({
        where: showPublishedOnly.value ? { published: true } : undefined,
        orderBy: { createdAt: 'desc' },
        include: { author: true },
    }),
    () => ({ enabled: enableFetch.value }),
);

const createPost = clientQueries.post.useCreate(() => ({ optimisticUpdate: optimistic.value }));
const deletePost = clientQueries.post.useDelete(() => ({ optimisticUpdate: optimistic.value }));
const updatePost = clientQueries.post.useUpdate(() => ({ optimisticUpdate: optimistic.value }));
const { mutate, isPending: isCreatingTransaction } = clientQueries.$transaction.useSequential({
    onSuccess(data) {
        const [user, draftPost, publicPost, postsBeforePublish, , publishedPosts] = data as TransactionBatchResult;
        const publishedDraftCount = postsBeforePublish.filter((post) => !post.published).length;
        transactionSucceeded.value = true;
        transactionMessage.value =
            `Created ${user.email}, then published ${publishedDraftCount} draft ` +
            `using ids mapped from step 4. Final public posts: ${publishedPosts.length} ` +
            `(${draftPost.title}, ${publicPost.title}).`;
    },
    onError(error) {
        transactionSucceeded.value = false;
        transactionMessage.value = error.message;
    },
});

const onCreatePost = () => {
    if (!users.value) {
        return;
    }

    // random title
    const title = lorem.generateWords();

    // random user as author
    const forUser = users.value[Math.floor(Math.random() * users.value.length)]!;

    console.log('Creating post for user:', forUser.id, 'with title:', title);
    createPost.mutate({
        data: {
            title,
            authorId: forUser.id,
        },
    });
};

const onDeletePost = (postId: string) => {
    deletePost.mutate({
        where: { id: postId },
    });
};

const onTogglePublishPost = (post: Post) => {
    updatePost.mutate({
        where: { id: post.id },
        data: { published: !post.published },
    });
};

const onCreateTransactionPost = () => {
    transactionMessage.value = '';
    transactionSucceeded.value = false;

    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const draftTitle = `Draft ${lorem.generateWords()}`;
    const publicTitle = `Public ${lorem.generateWords()}`;
    const email = `transaction-${suffix}@example.com`;

    mutate([
        {
            model: 'User',
            op: 'create',
            args: {
                data: {
                    email,
                    name: 'Transaction User',
                },
            },
        },
        {
            model: 'Post',
            op: 'create',
            args: {
                data: {
                    title: draftTitle,
                    published: false,
                    authorId: $get($stepRef<User>(1), 'id'),
                },
            },
        },
        {
            model: 'Post',
            op: 'create',
            args: {
                data: {
                    title: publicTitle,
                    published: true,
                    authorId: $get($stepRef<User>(1), 'id'),
                },
            },
        },
        {
            model: 'Post',
            op: 'findMany',
            args: {
                where: { authorId: $get($stepRef<User>(1), 'id') },
                orderBy: { createdAt: 'asc' },
            },
        },
        {
            model: 'Post',
            op: 'updateMany',
            args: {
                where: {
                    id: {
                        in: $map($filter($stepRef<Post[]>(4), 'published', 'eq', false), 'id'),
                    },
                },
                data: { published: true },
            },
        },
        {
            model: 'Post',
            op: 'findMany',
            args: {
                where: { authorId: $get($stepRef<User>(1), 'id'), published: true },
                orderBy: { createdAt: 'asc' },
            },
        },
    ]);
};
</script>

<template>
    <div v-if="isUsersFetched && (!users || users.length === 0)" class="p-4">
        No users found. Please run "pnpm db:init" to seed the database.
    </div>
    <div v-else class="flex flex-col mt-8 items-center gap-6 text-center sm:items-start sm:text-left">
        <h1 class="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            My Awesome Blog
        </h1>

        <div class="flex gap-4">
            <NuxtLink
                to="/feeds"
                class="rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 transition-colors"
            >
                View Public Feeds
            </NuxtLink>
            <NuxtLink
                to="/signup"
                class="rounded-md bg-purple-600 px-4 py-2 text-white font-medium hover:bg-purple-700 transition-colors"
            >
                Sign Up
            </NuxtLink>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
            <button
                @click="onCreatePost"
                class="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 cursor-pointer"
            >
                New Post
            </button>

            <button
                :disabled="isCreatingTransaction"
                @click="onCreateTransactionPost"
                class="rounded-md bg-orange-600 px-4 py-2 text-white hover:bg-orange-700 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
                {{ isCreatingTransaction ? 'Running transaction...' : 'Batch User + Posts Transaction' }}
            </button>
        </div>

        <p
            v-if="transactionMessage"
            class="text-sm"
            :class="transactionSucceeded ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
        >
            {{ transactionMessage }}
        </p>

        <div>
            <div>Current users</div>
            <div class="flex flex-col gap-1 p-2">
                <div v-for="user in users" :key="user.id" class="text-sm text-gray-500">
                    {{ user.email }}
                </div>
            </div>
        </div>

        <div class="flex flex-col gap-1">
            <label class="text-sm text-gray-700 dark:text-gray-300">
                <input v-model="showPublishedOnly" type="checkbox" class="mr-2" />
                Show published only
            </label>

            <label class="text-sm text-gray-700 dark:text-gray-300">
                <input v-model="enableFetch" type="checkbox" class="mr-2" />
                Enable fetch
            </label>

            <label class="text-sm text-gray-700 dark:text-gray-300">
                <input v-model="optimistic" type="checkbox" class="mr-2" />
                Optimistic update
            </label>
        </div>

        <ul class="flex flex-col gap-2 container">
            <li v-for="post in posts" :key="post.id">
                <div class="flex justify-between">
                    <div class="flex gap-2 items-baseline">
                        <h2 class="text-xl font-semibold">{{ post.title }}</h2>
                        <span v-if="post.$optimistic" class="text-sm">pending</span>
                    </div>
                    <div class="ml-4 flex w-32">
                        <button
                            class="rounded-md px-2 py-1 text-white cursor-pointer underline text-xs"
                            @click="onDeletePost(post.id)"
                        >
                            Delete
                        </button>
                        <button
                            class="rounded-md px-2 py-1 text-white cursor-pointer underline text-xs"
                            @click="onTogglePublishPost(post)"
                        >
                            {{ post.published ? 'Unpublish' : 'Publish' }}
                        </button>
                    </div>
                </div>
                <p v-if="!post.$optimistic" class="text-sm text-gray-500">
                    by {{ post.author.name }} {{ !post.published ? '(Draft)' : '' }}
                </p>
            </li>
        </ul>
    </div>
</template>
