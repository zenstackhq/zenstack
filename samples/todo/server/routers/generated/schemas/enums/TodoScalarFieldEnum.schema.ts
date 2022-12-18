import { z } from 'zod';

export const TodoScalarFieldEnumSchema = z.enum([
  'id',
  'createdAt',
  'updatedAt',
  'ownerId',
  'listId',
  'title',
  'completedAt',
  'zenstack_guard',
  'zenstack_transaction',
]);
