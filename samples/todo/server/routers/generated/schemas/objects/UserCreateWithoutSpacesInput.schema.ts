import { z } from 'zod';
import { ListCreateNestedManyWithoutOwnerInputObjectSchema } from './ListCreateNestedManyWithoutOwnerInput.schema';
import { TodoCreateNestedManyWithoutOwnerInputObjectSchema } from './TodoCreateNestedManyWithoutOwnerInput.schema';
import { AccountCreateNestedManyWithoutUserInputObjectSchema } from './AccountCreateNestedManyWithoutUserInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserCreateWithoutSpacesInput> = z
    .object({
        id: z.string().optional(),
        createdAt: z.date().optional(),
        updatedAt: z.date().optional(),
        email: z.string(),
        emailVerified: z.date().optional().nullable(),
        password: z.string().optional().nullable(),
        name: z.string().optional().nullable(),
        image: z.string().optional().nullable(),
        lists: z.lazy(() => ListCreateNestedManyWithoutOwnerInputObjectSchema).optional(),
        todos: z.lazy(() => TodoCreateNestedManyWithoutOwnerInputObjectSchema).optional(),
        accounts: z.lazy(() => AccountCreateNestedManyWithoutUserInputObjectSchema).optional(),
    })
    .strict();

export const UserCreateWithoutSpacesInputObjectSchema = Schema;
