import { z } from 'zod';

export const SpaceUserScalarFieldEnumSchema = z.enum([
    'id',
    'createdAt',
    'updatedAt',
    'spaceId',
    'userId',
    'role',
    'zenstack_guard',
    'zenstack_transaction',
]);
