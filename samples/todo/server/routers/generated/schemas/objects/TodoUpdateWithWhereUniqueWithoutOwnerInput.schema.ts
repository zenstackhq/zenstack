import { z } from 'zod';
import { TodoWhereUniqueInputObjectSchema } from './TodoWhereUniqueInput.schema';
import { TodoUpdateWithoutOwnerInputObjectSchema } from './TodoUpdateWithoutOwnerInput.schema';
import { TodoUncheckedUpdateWithoutOwnerInputObjectSchema } from './TodoUncheckedUpdateWithoutOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.TodoUpdateWithWhereUniqueWithoutOwnerInput> = z
    .object({
        where: z.lazy(() => TodoWhereUniqueInputObjectSchema),
        data: z.union([
            z.lazy(() => TodoUpdateWithoutOwnerInputObjectSchema),
            z.lazy(() => TodoUncheckedUpdateWithoutOwnerInputObjectSchema),
        ]),
    })
    .strict();

export const TodoUpdateWithWhereUniqueWithoutOwnerInputObjectSchema = Schema;
