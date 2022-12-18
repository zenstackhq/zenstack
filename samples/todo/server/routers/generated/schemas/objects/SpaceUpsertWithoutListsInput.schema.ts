import { z } from 'zod';
import { SpaceUpdateWithoutListsInputObjectSchema } from './SpaceUpdateWithoutListsInput.schema';
import { SpaceUncheckedUpdateWithoutListsInputObjectSchema } from './SpaceUncheckedUpdateWithoutListsInput.schema';
import { SpaceCreateWithoutListsInputObjectSchema } from './SpaceCreateWithoutListsInput.schema';
import { SpaceUncheckedCreateWithoutListsInputObjectSchema } from './SpaceUncheckedCreateWithoutListsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUpsertWithoutListsInput> = z
  .object({
    update: z.union([
      z.lazy(() => SpaceUpdateWithoutListsInputObjectSchema),
      z.lazy(() => SpaceUncheckedUpdateWithoutListsInputObjectSchema),
    ]),
    create: z.union([
      z.lazy(() => SpaceCreateWithoutListsInputObjectSchema),
      z.lazy(() => SpaceUncheckedCreateWithoutListsInputObjectSchema),
    ]),
  })
  .strict();

export const SpaceUpsertWithoutListsInputObjectSchema = Schema;
