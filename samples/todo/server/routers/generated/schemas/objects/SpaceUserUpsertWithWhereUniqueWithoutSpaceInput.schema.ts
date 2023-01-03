import { z } from 'zod';
import { SpaceUserWhereUniqueInputObjectSchema } from './SpaceUserWhereUniqueInput.schema';
import { SpaceUserUpdateWithoutSpaceInputObjectSchema } from './SpaceUserUpdateWithoutSpaceInput.schema';
import { SpaceUserUncheckedUpdateWithoutSpaceInputObjectSchema } from './SpaceUserUncheckedUpdateWithoutSpaceInput.schema';
import { SpaceUserCreateWithoutSpaceInputObjectSchema } from './SpaceUserCreateWithoutSpaceInput.schema';
import { SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema } from './SpaceUserUncheckedCreateWithoutSpaceInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUpsertWithWhereUniqueWithoutSpaceInput> = z
    .object({
        where: z.lazy(() => SpaceUserWhereUniqueInputObjectSchema),
        update: z.union([
            z.lazy(() => SpaceUserUpdateWithoutSpaceInputObjectSchema),
            z.lazy(() => SpaceUserUncheckedUpdateWithoutSpaceInputObjectSchema),
        ]),
        create: z.union([
            z.lazy(() => SpaceUserCreateWithoutSpaceInputObjectSchema),
            z.lazy(() => SpaceUserUncheckedCreateWithoutSpaceInputObjectSchema),
        ]),
    })
    .strict();

export const SpaceUserUpsertWithWhereUniqueWithoutSpaceInputObjectSchema = Schema;
