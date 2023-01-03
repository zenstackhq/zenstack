import { z } from 'zod';
import { UserCreateWithoutTodosInputObjectSchema } from './UserCreateWithoutTodosInput.schema';
import { UserUncheckedCreateWithoutTodosInputObjectSchema } from './UserUncheckedCreateWithoutTodosInput.schema';
import { UserCreateOrConnectWithoutTodosInputObjectSchema } from './UserCreateOrConnectWithoutTodosInput.schema';
import { UserUpsertWithoutTodosInputObjectSchema } from './UserUpsertWithoutTodosInput.schema';
import { UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserUpdateWithoutTodosInputObjectSchema } from './UserUpdateWithoutTodosInput.schema';
import { UserUncheckedUpdateWithoutTodosInputObjectSchema } from './UserUncheckedUpdateWithoutTodosInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUpdateOneRequiredWithoutTodosNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => UserCreateWithoutTodosInputObjectSchema),
                z.lazy(() => UserUncheckedCreateWithoutTodosInputObjectSchema),
            ])
            .optional(),
        connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutTodosInputObjectSchema).optional(),
        upsert: z.lazy(() => UserUpsertWithoutTodosInputObjectSchema).optional(),
        connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
        update: z
            .union([
                z.lazy(() => UserUpdateWithoutTodosInputObjectSchema),
                z.lazy(() => UserUncheckedUpdateWithoutTodosInputObjectSchema),
            ])
            .optional(),
    })
    .strict();

export const UserUpdateOneRequiredWithoutTodosNestedInputObjectSchema = Schema;
