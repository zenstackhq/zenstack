import moment from 'moment';

type Props = {
    value: { createdAt: Date; updatedAt: Date; completedAt?: Date | null };
};

export default function TimeInfo({ value }: Props) {
    return (
        <p className="text-sm text-gray-500">
            {value.completedAt
                ? `Completed ${moment(value.completedAt).fromNow()}`
                : value.createdAt === value.updatedAt
                ? `Created ${moment(value.createdAt).fromNow()}`
                : `Updated ${moment(value.updatedAt).fromNow()}`}
        </p>
    );
}
