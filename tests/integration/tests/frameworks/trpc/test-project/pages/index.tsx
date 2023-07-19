import { trpc } from '../lib/trpc';

export default function Home() {
    const { data: posts } = trpc.post.findMany.useQuery({});
    return (
        <div>
            {posts?.map((post) => (
                <p key={post.id}>{post.title}</p>
            ))}
        </div>
    );
}
