import { z } from 'zod';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListCreateWithoutSpaceInputObjectSchema } from './ListCreateWithoutSpaceInput.schema';
import { ListUncheckedCreateWithoutSpaceInputObjectSchema } from './ListUncheckedCreateWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListCreateOrConnectWithoutSpaceInput> = z
  .object({
    where: z.lazy(() => ListWhereUniqueInputObjectSchema),
    create: z.union([
      z.lazy(() => ListCreateWithoutSpaceInputObjectSchema),
      z.lazy(() => ListUncheckedCreateWithoutSpaceInputObjectSchema),
    ]),
  })
  .strict();

export const ListCreateOrConnectWithoutSpaceInputObjectSchema = Schema;
