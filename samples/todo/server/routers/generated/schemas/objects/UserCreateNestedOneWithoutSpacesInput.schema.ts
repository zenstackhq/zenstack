import { z } from 'zod';
import { UserCreateWithoutSpacesInputObjectSchema } from './UserCreateWithoutSpacesInput.schema';
import { UserUncheckedCreateWithoutSpacesInputObjectSchema } from './UserUncheckedCreateWithoutSpacesInput.schema';
import { UserCreateOrConnectWithoutSpacesInputObjectSchema } from './UserCreateOrConnectWithoutSpacesInput.schema';
import { UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserCreateNestedOneWithoutSpacesInput> = z
    .object({
        create: z
            .union([
                z.lazy(() => UserCreateWithoutSpacesInputObjectSchema),
                z.lazy(() => UserUncheckedCreateWithoutSpacesInputObjectSchema),
            ])
            .optional(),
        connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutSpacesInputObjectSchema).optional(),
        connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
    })
    .strict();

export const UserCreateNestedOneWithoutSpacesInputObjectSchema = Schema;
