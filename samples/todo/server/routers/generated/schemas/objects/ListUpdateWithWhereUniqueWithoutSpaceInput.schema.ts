import { z } from 'zod';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListUpdateWithoutSpaceInputObjectSchema } from './ListUpdateWithoutSpaceInput.schema';
import { ListUncheckedUpdateWithoutSpaceInputObjectSchema } from './ListUncheckedUpdateWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpdateWithWhereUniqueWithoutSpaceInput> = z
  .object({
    where: z.lazy(() => ListWhereUniqueInputObjectSchema),
    data: z.union([
      z.lazy(() => ListUpdateWithoutSpaceInputObjectSchema),
      z.lazy(() => ListUncheckedUpdateWithoutSpaceInputObjectSchema),
    ]),
  })
  .strict();

export const ListUpdateWithWhereUniqueWithoutSpaceInputObjectSchema = Schema;
