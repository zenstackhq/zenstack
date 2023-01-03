import { z } from 'zod';
import { UserCreateWithoutSpacesInputObjectSchema } from './UserCreateWithoutSpacesInput.schema';
import { UserUncheckedCreateWithoutSpacesInputObjectSchema } from './UserUncheckedCreateWithoutSpacesInput.schema';
import { UserCreateOrConnectWithoutSpacesInputObjectSchema } from './UserCreateOrConnectWithoutSpacesInput.schema';
import { UserUpsertWithoutSpacesInputObjectSchema } from './UserUpsertWithoutSpacesInput.schema';
import { UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserUpdateWithoutSpacesInputObjectSchema } from './UserUpdateWithoutSpacesInput.schema';
import { UserUncheckedUpdateWithoutSpacesInputObjectSchema } from './UserUncheckedUpdateWithoutSpacesInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUpdateOneRequiredWithoutSpacesNestedInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => UserCreateWithoutSpacesInputObjectSchema),
                z.lazy(() => UserUncheckedCreateWithoutSpacesInputObjectSchema),
            ])
            .optional(),
        connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutSpacesInputObjectSchema).optional(),
        upsert: z.lazy(() => UserUpsertWithoutSpacesInputObjectSchema).optional(),
        connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
        update: z
            .union([
                z.lazy(() => UserUpdateWithoutSpacesInputObjectSchema),
                z.lazy(() => UserUncheckedUpdateWithoutSpacesInputObjectSchema),
            ])
            .optional(),
    })
    .strict();

export const UserUpdateOneRequiredWithoutSpacesNestedInputObjectSchema = Schema;
