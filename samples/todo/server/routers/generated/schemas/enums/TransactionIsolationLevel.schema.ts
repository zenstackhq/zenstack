import { z } from 'zod';

export const TransactionIsolationLevelSchema = z.enum([
    'ReadUncommitted',
    'ReadCommitted',
    'RepeatableRead',
    'Serializable',
]);
