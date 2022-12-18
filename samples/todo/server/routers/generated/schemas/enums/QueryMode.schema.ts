import { z } from 'zod';

export const QueryModeSchema = z.enum(['default', 'insensitive']);
