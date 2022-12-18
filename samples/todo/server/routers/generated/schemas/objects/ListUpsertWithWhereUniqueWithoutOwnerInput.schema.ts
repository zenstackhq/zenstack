import { z } from 'zod';
import { ListWhereUniqueInputObjectSchema } from './ListWhereUniqueInput.schema';
import { ListUpdateWithoutOwnerInputObjectSchema } from './ListUpdateWithoutOwnerInput.schema';
import { ListUncheckedUpdateWithoutOwnerInputObjectSchema } from './ListUncheckedUpdateWithoutOwnerInput.schema';
import { ListCreateWithoutOwnerInputObjectSchema } from './ListCreateWithoutOwnerInput.schema';
import { ListUncheckedCreateWithoutOwnerInputObjectSchema } from './ListUncheckedCreateWithoutOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.ListUpsertWithWhereUniqueWithoutOwnerInput> = z
  .object({
    where: z.lazy(() => ListWhereUniqueInputObjectSchema),
    update: z.union([
      z.lazy(() => ListUpdateWithoutOwnerInputObjectSchema),
      z.lazy(() => ListUncheckedUpdateWithoutOwnerInputObjectSchema),
    ]),
    create: z.union([
      z.lazy(() => ListCreateWithoutOwnerInputObjectSchema),
      z.lazy(() => ListUncheckedCreateWithoutOwnerInputObjectSchema),
    ]),
  })
  .strict();

export const ListUpsertWithWhereUniqueWithoutOwnerInputObjectSchema = Schema;
