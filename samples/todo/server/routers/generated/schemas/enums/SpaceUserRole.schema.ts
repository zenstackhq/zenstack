import { z } from 'zod';

export const SpaceUserRoleSchema = z.enum(['USER', 'ADMIN']);
