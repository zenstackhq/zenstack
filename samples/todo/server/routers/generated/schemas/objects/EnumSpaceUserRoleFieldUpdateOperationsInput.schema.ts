import { z } from 'zod';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.EnumSpaceUserRoleFieldUpdateOperationsInput> = z
  .object({
    set: z.lazy(() => SpaceUserRoleSchema).optional(),
  })
  .strict();

export const EnumSpaceUserRoleFieldUpdateOperationsInputObjectSchema = Schema;
