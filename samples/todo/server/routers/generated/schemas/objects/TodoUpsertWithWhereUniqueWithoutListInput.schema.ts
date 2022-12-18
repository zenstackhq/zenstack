import { z } from 'zod';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoUpdateWithoutListInputObjectSchema } from './TodoUpdateWithoutListInput.schema';
import { TodoUncheckedUpdateWithoutListInputObjectSchema } from './TodoUncheckedUpdateWithoutListInput.schema';
import { TodoCreateWithoutListInputObjectSchema } from './TodoCreateWithoutListInput.schema';
import { TodoUncheckedCreateWithoutListInputObjectSchema } from './TodoUncheckedCreateWithoutListInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoUpsertWithWhereUniqueWithoutListInput> = z
  .object({
    where: z.lazy(() => TodoWhereUniqueInputObjectSchema),
    update: z.union([
      z.lazy(() => TodoUpdateWithoutListInputObjectSchema),
      z.lazy(() => TodoUncheckedUpdateWithoutListInputObjectSchema),
    ]),
    create: z.union([
      z.lazy(() => TodoCreateWithoutListInputObjectSchema),
      z.lazy(() => TodoUncheckedCreateWithoutListInputObjectSchema),
    ]),
  })
  .strict();

export const TodoUpsertWithWhereUniqueWithoutListInputObjectSchema = Schema;
