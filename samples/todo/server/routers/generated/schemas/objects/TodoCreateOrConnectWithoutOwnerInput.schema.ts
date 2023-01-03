import { z } from 'zod';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoCreateWithoutOwnerInputObjectSchema } from './TodoCreateWithoutOwnerInput.schema';
import { TodoUncheckedCreateWithoutOwnerInputObjectSchema } from './TodoUncheckedCreateWithoutOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoCreateOrConnectWithoutOwnerInput> = z
    .object({
        where: z.lazy(() => TodoWhereUniqueInputObjectSchema),
        create: z.union([
            z.lazy(() => TodoCreateWithoutOwnerInputObjectSchema),
            z.lazy(() => TodoUncheckedCreateWithoutOwnerInputObjectSchema),
        ]),
    })
    .strict();

export const TodoCreateOrConnectWithoutOwnerInputObjectSchema = Schema;
