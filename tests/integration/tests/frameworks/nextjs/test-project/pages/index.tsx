import { useFindManyPost } from '../lib/hooks';

export default function Home() {
    const { data: posts } = useFindManyPost();
    return (
        <div>
            {posts?.map((post) => (
                <p key={post.id}>{post.title}</p>
            ))}
        </div>
    );
}
