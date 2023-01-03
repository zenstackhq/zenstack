import { z } from 'zod';
import { ListUncheckedCreateNestedManyWithoutOwnerInputObjectSchema } from './ListUncheckedCreateNestedManyWithoutOwnerInput.schema';
import { TodoUncheckedCreateNestedManyWithoutOwnerInputObjectSchema } from './TodoUncheckedCreateNestedManyWithoutOwnerInput.schema';
import { AccountUncheckedCreateNestedManyWithoutUserInputObjectSchema } from './AccountUncheckedCreateNestedManyWithoutUserInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedCreateWithoutSpacesInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        email: z.string(),
        emailVerified: z.date().optional().nullable(),
        password: z.string().optional().nullable(),
        name: z.string().optional().nullable(),
        image: z.string().optional().nullable(),
        lists: z.lazy(() => ListUncheckedCreateNestedManyWithoutOwnerInputObjectSchema).optional(),
        todos: z.lazy(() => TodoUncheckedCreateNestedManyWithoutOwnerInputObjectSchema).optional(),
        accounts: z.lazy(() => AccountUncheckedCreateNestedManyWithoutUserInputObjectSchema).optional(),
    })
    .strict();

export const UserUncheckedCreateWithoutSpacesInputObjectSchema = Schema;
