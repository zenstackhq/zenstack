import { z } from 'zod';

export const UserScalarFieldEnumSchema = z.enum([
    'id',
    'createdAt',
    'updatedAt',
    'email',
    'emailVerified',
    'password',
    'name',
    'image',
    'zenstack_guard',
    'zenstack_transaction',
]);
