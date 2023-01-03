import { z } from 'zod';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoUpdateWithoutOwnerInputObjectSchema } from './TodoUpdateWithoutOwnerInput.schema';
import { TodoUncheckedUpdateWithoutOwnerInputObjectSchema } from './TodoUncheckedUpdateWithoutOwnerInput.schema';
import { TodoCreateWithoutOwnerInputObjectSchema } from './TodoCreateWithoutOwnerInput.schema';
import { TodoUncheckedCreateWithoutOwnerInputObjectSchema } from './TodoUncheckedCreateWithoutOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoUpsertWithWhereUniqueWithoutOwnerInput> = z
    .object({
        where: z.lazy(() => TodoWhereUniqueInputObjectSchema),
        update: z.union([
            z.lazy(() => TodoUpdateWithoutOwnerInputObjectSchema),
            z.lazy(() => TodoUncheckedUpdateWithoutOwnerInputObjectSchema),
        ]),
        create: z.union([
            z.lazy(() => TodoCreateWithoutOwnerInputObjectSchema),
            z.lazy(() => TodoUncheckedCreateWithoutOwnerInputObjectSchema),
        ]),
    })
    .strict();

export const TodoUpsertWithWhereUniqueWithoutOwnerInputObjectSchema = Schema;
