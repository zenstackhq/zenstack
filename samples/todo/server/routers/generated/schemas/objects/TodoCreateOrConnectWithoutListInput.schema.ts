import { z } from 'zod';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoCreateWithoutListInputObjectSchema } from './TodoCreateWithoutListInput.schema';
import { TodoUncheckedCreateWithoutListInputObjectSchema } from './TodoUncheckedCreateWithoutListInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateOrConnectWithoutListInput> = z
    .object({
        where: z.lazy(() => TodoWhereUniqueInputObjectSchema),
        create: z.union([
            z.lazy(() => TodoCreateWithoutListInputObjectSchema),
            z.lazy(() => TodoUncheckedCreateWithoutListInputObjectSchema),
        ]),
    })
    .strict();

export const TodoCreateOrConnectWithoutListInputObjectSchema = Schema;
