import { z } from 'zod';
import { UserUpdateWithoutSpacesInputObjectSchema } from './UserUpdateWithoutSpacesInput.schema';
import { UserUncheckedUpdateWithoutSpacesInputObjectSchema } from './UserUncheckedUpdateWithoutSpacesInput.schema';
import { UserCreateWithoutSpacesInputObjectSchema } from './UserCreateWithoutSpacesInput.schema';
import { UserUncheckedCreateWithoutSpacesInputObjectSchema } from './UserUncheckedCreateWithoutSpacesInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUpsertWithoutSpacesInput> = z
    .object({
        update: z.union([
            z.lazy(() => UserUpdateWithoutSpacesInputObjectSchema),
            z.lazy(() => UserUncheckedUpdateWithoutSpacesInputObjectSchema),
        ]),
        create: z.union([
            z.lazy(() => UserCreateWithoutSpacesInputObjectSchema),
            z.lazy(() => UserUncheckedCreateWithoutSpacesInputObjectSchema),
        ]),
    })
    .strict();

export const UserUpsertWithoutSpacesInputObjectSchema = Schema;
