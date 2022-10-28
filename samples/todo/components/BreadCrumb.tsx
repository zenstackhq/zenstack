import { useList } from '@zenstackhq/runtime/hooks';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCurrentSpace } from '@lib/context';

export default function BreadCrumb() {
    const router = useRouter();
    const space = useCurrentSpace();
    const { get: getList } = useList();

    const parts = router.asPath.split('/').filter((p) => p);

    const [base, slug, listId] = parts;
    if (base !== 'space') {
        return <></>;
    }

    const items: Array<{ text: string; link: string }> = [];

    items.push({ text: 'Home', link: '/' });
    items.push({ text: space?.name || '', link: `/space/${slug}` });

    if (listId) {
        const { data } = getList(listId);
        items.push({
            text: data?.title || '',
            link: `/space/${slug}/${listId}`,
        });
    }

    return (
        <div className="text-sm text-gray-600 breadcrumbs">
            <ul>
                {items.map((item, i) => (
                    <li key={i}>
                        <Link href={item.link}>
                            <a>{item.text}</a>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
    );
}
