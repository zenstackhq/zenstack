import { z } from 'zod';
import { SpaceUpdateWithoutMembersInputObjectSchema } from './SpaceUpdateWithoutMembersInput.schema';
import { SpaceUncheckedUpdateWithoutMembersInputObjectSchema } from './SpaceUncheckedUpdateWithoutMembersInput.schema';
import { SpaceCreateWithoutMembersInputObjectSchema } from './SpaceCreateWithoutMembersInput.schema';
import { SpaceUncheckedCreateWithoutMembersInputObjectSchema } from './SpaceUncheckedCreateWithoutMembersInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUpsertWithoutMembersInput> = z
    .object({
        update: z.union([
            z.lazy(() => SpaceUpdateWithoutMembersInputObjectSchema),
            z.lazy(() => SpaceUncheckedUpdateWithoutMembersInputObjectSchema),
        ]),
        create: z.union([
            z.lazy(() => SpaceCreateWithoutMembersInputObjectSchema),
            z.lazy(() => SpaceUncheckedCreateWithoutMembersInputObjectSchema),
        ]),
    })
    .strict();

export const SpaceUpsertWithoutMembersInputObjectSchema = Schema;
