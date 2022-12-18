import { z } from 'zod';
import { ListUpdateWithoutTodosInputObjectSchema } from './ListUpdateWithoutTodosInput.schema';
import { ListUncheckedUpdateWithoutTodosInputObjectSchema } from './ListUncheckedUpdateWithoutTodosInput.schema';
import { ListCreateWithoutTodosInputObjectSchema } from './ListCreateWithoutTodosInput.schema';
import { ListUncheckedCreateWithoutTodosInputObjectSchema } from './ListUncheckedCreateWithoutTodosInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpsertWithoutTodosInput> = z
  .object({
    update: z.union([
      z.lazy(() => ListUpdateWithoutTodosInputObjectSchema),
      z.lazy(() => ListUncheckedUpdateWithoutTodosInputObjectSchema),
    ]),
    create: z.union([
      z.lazy(() => ListCreateWithoutTodosInputObjectSchema),
      z.lazy(() => ListUncheckedCreateWithoutTodosInputObjectSchema),
    ]),
  })
  .strict();

export const ListUpsertWithoutTodosInputObjectSchema = Schema;
