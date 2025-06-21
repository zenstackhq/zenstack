/* eslint-disable @typescript-eslint/no-explicit-any */

type Cb = (
    data: {
        path: readonly string[];
        key: string | undefined;
        value: any;
        update: (nextValue: any) => void;
    }
) => void;

export function simpleTraverse<T>(root: T, cb: Cb) {
    const path: string[] = [];
    const parents: any[] = [];

    function walker(node: any) {
        const isObject = typeof node === 'object' && node !== null;
        const isCircular = isObject && parents.some((p) => p === node);

        let keepGoing = true;

        function update(nextValue: any) {
            if (path.length) {
                const parent = parents[parents.length - 1];
                const key = path[path.length - 1];
                parent[key] = nextValue;
                node = nextValue;
            }

            keepGoing = false;
        }

        cb({
            path: [...path],
            key: path[path.length - 1],
            value: node,
            update,
        });

        if (!keepGoing) return node;

        if (isObject && !isCircular) {
            parents.push(node);

            Object.keys(node).forEach((key) => {
                path.push(key);

                walker(node[key]);

                path.pop();
            });

            parents.pop();
        }

        return node;
    }

    return walker(root);
}
