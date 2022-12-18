import { z } from 'zod';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListUpdateWithoutSpaceInputObjectSchema } from './ListUpdateWithoutSpaceInput.schema';
import { ListUncheckedUpdateWithoutSpaceInputObjectSchema } from './ListUncheckedUpdateWithoutSpaceInput.schema';
import { ListCreateWithoutSpaceInputObjectSchema } from './ListCreateWithoutSpaceInput.schema';
import { ListUncheckedCreateWithoutSpaceInputObjectSchema } from './ListUncheckedCreateWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpsertWithWhereUniqueWithoutSpaceInput> = z
  .object({
    where: z.lazy(() => ListWhereUniqueInputObjectSchema),
    update: z.union([
      z.lazy(() => ListUpdateWithoutSpaceInputObjectSchema),
      z.lazy(() => ListUncheckedUpdateWithoutSpaceInputObjectSchema),
    ]),
    create: z.union([
      z.lazy(() => ListCreateWithoutSpaceInputObjectSchema),
      z.lazy(() => ListUncheckedCreateWithoutSpaceInputObjectSchema),
    ]),
  })
  .strict();

export const ListUpsertWithWhereUniqueWithoutSpaceInputObjectSchema = Schema;
