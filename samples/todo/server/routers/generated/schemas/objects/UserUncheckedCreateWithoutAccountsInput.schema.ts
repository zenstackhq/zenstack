import { z } from 'zod';
import { SpaceUserUncheckedCreateNestedManyWithoutUserInputObjectSchema } from './SpaceUserUncheckedCreateNestedManyWithoutUserInput.schema';
import { ListUncheckedCreateNestedManyWithoutOwnerInputObjectSchema } from './ListUncheckedCreateNestedManyWithoutOwnerInput.schema';
import { TodoUncheckedCreateNestedManyWithoutOwnerInputObjectSchema } from './TodoUncheckedCreateNestedManyWithoutOwnerInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedCreateWithoutAccountsInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        email: z.string(),
        emailVerified: z.date().optional().nullable(),
        password: z.string().optional().nullable(),
        name: z.string().optional().nullable(),
        spaces: z.lazy(() => SpaceUserUncheckedCreateNestedManyWithoutUserInputObjectSchema).optional(),
        image: z.string().optional().nullable(),
        lists: z.lazy(() => ListUncheckedCreateNestedManyWithoutOwnerInputObjectSchema).optional(),
        todos: z.lazy(() => TodoUncheckedCreateNestedManyWithoutOwnerInputObjectSchema).optional(),
    })
    .strict();

export const UserUncheckedCreateWithoutAccountsInputObjectSchema = Schema;
