import { z } from 'zod';

export const SpaceScalarFieldEnumSchema = z.enum([
  'id',
  'createdAt',
  'updatedAt',
  'name',
  'slug',
  'zenstack_guard',
  'zenstack_transaction',
]);
