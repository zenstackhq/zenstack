import { usePost } from '../lib/hooks';

export default function Home() {
    const { findMany } = usePost();
    const { data: posts } = findMany();
    return (
        <div>
            {posts?.map((post) => (
                <p key={post.id}>{post.title}</p>
            ))}
        </div>
    );
}
