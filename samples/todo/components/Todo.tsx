import { Todo } from '@zenstackhq/runtime/types';

type Props = {
    value: Todo;
};

export default function Component({ value }: Props) {
    return <div>{value.title}</div>;
}
