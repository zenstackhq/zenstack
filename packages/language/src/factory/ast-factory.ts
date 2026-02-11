import { type AstNode } from '../ast';

export type ContainerProps<T extends AstNode | undefined> = {
    $container: T;
    $containerProperty?: string;
    $containerIndex?: number;
};

type NodeFactoriesFor<N> = {
    [K in keyof N as {} extends Pick<N, K> ? never : K]: N[K] extends (infer U)[]
        ? (AstFactory<U extends AstNode ? U : AstNode> | U)[]
        : AstFactory<N[K] extends AstNode ? N[K] : AstNode> | N[K];
} & {
    [K in keyof N as {} extends Pick<N, K> ? K : never]?: N[K] extends (infer U)[]
        ? (AstFactory<U extends AstNode ? U : AstNode> | U)[]
        : AstFactory<N[K] extends AstNode ? N[K] : AstNode> | N[K];
};

export abstract class AstFactory<T extends AstNode = AstNode> {
    node = {} as T;
    constructor({ type, node }: { type: T['$type']; node?: Partial<T> }) {
        (this.node as any).$type = type;
        if (node) {
            this.update(node);
        }
    }
    setContainer(container: T['$container']) {
        (this.node as any).$container = container;
        return this;
    }

    get(params?: ContainerProps<T['$container']>): T {
        if (params) this.update(params as any);
        return this.node;
    }
    update(nodeArg: Partial<T | NodeFactoriesFor<T>>): T {
        const keys = Object.keys(nodeArg as object);
        keys.forEach((key) => {
            const child = (nodeArg as any)[key];
            if (child instanceof AstFactory) {
                (this.node as any)[key] = child.get({ $container: this.node as any });
            } else if (Array.isArray(child)) {
                (this.node as any)[key] = child.map((item: any) =>
                    item instanceof AstFactory ? item.get({ $container: this.node as any }) : item,
                );
            } else {
                (this.node as any)[key] = child;
            }
        });
        return this.node;
    }
}
