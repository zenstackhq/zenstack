<script setup lang="ts">
const { $client } = useNuxtApp();

$client.post.findFirst
    .query({
        where: { id: '1' },
        include: { author: true },
    })
    .then((post) => {
        console.log('Author:', post?.author.email);
    });

const { data: posts } = $client.post.findMany.useQuery({
    include: { author: true },
});

const { mutate } = $client.post.create.useMutation();

const onCreate = async () => {
    const r1 = await $client.post.create.mutate({
        data: {
            title: 'New Post',
            content: 'This is a new post',
            author: { connect: { id: '1' } },
        },
        include: { author: true },
    });
    console.log('Created by:', r1.author.email);

    const r2 = await mutate({
        data: {
            title: 'New Post',
            content: 'This is a new post',
            author: { connect: { id: '1' } },
        },
        include: { author: true },
    });
    console.log('Created by:', r2?.author.email);
};
</script>

<template>
    <h1>Home</h1>
    <div>
        <ul>
            <li v-for="post in posts" :key="post.id">{{ post.title }} by {{ post.author.email }}</li>
        </ul>
        <button @click="onCreate">Create Post</button>
    </div>
</template>
