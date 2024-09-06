import { api } from '~/utils/api';
import styles from './index.module.css';

export default function Home() {
    const hello = api.greet.hello.useQuery({ text: 'from tRPC' });
    const posts = api.post.findMany.useQuery({ where: { published: true }, include: { author: true } });
    const postsTransformed = api.post.findMany.useQuery(
        {},
        { select: (data) => data.map((p) => ({ id: p.id, title: p.name })) }
    );

    return (
        <>
            <main className={styles.main}>
                {hello.data && <h1 className={styles.title}>{hello.data.greeting}</h1>}
                {posts.data &&
                    posts.data.map((post) => (
                        <p key={post.id}>
                            {post.name} by {post.author.email}
                        </p>
                    ))}
                {postsTransformed.data && postsTransformed.data.map((post) => <p key={post.id}>{post.title}</p>)}
            </main>
        </>
    );
}
