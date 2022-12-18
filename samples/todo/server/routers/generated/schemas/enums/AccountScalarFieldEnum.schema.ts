import { z } from 'zod';

export const AccountScalarFieldEnumSchema = z.enum([
  'id',
  'userId',
  'type',
  'provider',
  'providerAccountId',
  'refresh_token',
  'refresh_token_expires_in',
  'access_token',
  'expires_at',
  'token_type',
  'scope',
  'id_token',
  'session_state',
]);
