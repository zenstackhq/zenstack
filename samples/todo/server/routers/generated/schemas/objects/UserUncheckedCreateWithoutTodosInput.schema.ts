import { z } from 'zod';
import { SpaceUserUncheckedCreateNestedManyWithoutUserInputObjectSchema } from './SpaceUserUncheckedCreateNestedManyWithoutUserInput.schema';
import { ListUncheckedCreateNestedManyWithoutOwnerInputObjectSchema } from './ListUncheckedCreateNestedManyWithoutOwnerInput.schema';
import { AccountUncheckedCreateNestedManyWithoutUserInputObjectSchema } from './AccountUncheckedCreateNestedManyWithoutUserInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedCreateWithoutTodosInput> = z
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
        accounts: z.lazy(() => AccountUncheckedCreateNestedManyWithoutUserInputObjectSchema).optional(),
    })
    .strict();

export const UserUncheckedCreateWithoutTodosInputObjectSchema = Schema;
