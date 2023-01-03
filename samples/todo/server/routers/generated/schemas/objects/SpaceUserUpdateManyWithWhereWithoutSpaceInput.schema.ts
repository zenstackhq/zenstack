import { z } from 'zod';
import { SpaceUserScalarWhereInputObjectSchema } from './SpaceUserScalarWhereInput.schema';
import { SpaceUserUpdateManyMutationInputObjectSchema } from './SpaceUserUpdateManyMutationInput.schema';
import { SpaceUserUncheckedUpdateManyWithoutMembersInputObjectSchema } from './SpaceUserUncheckedUpdateManyWithoutMembersInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUpdateManyWithWhereWithoutSpaceInput> = z
    .object({
        where: z.lazy(() => SpaceUserScalarWhereInputObjectSchema),
        data: z.union([
            z.lazy(() => SpaceUserUpdateManyMutationInputObjectSchema),
            z.lazy(() => SpaceUserUncheckedUpdateManyWithoutMembersInputObjectSchema),
        ]),
    })
    .strict();

export const SpaceUserUpdateManyWithWhereWithoutSpaceInputObjectSchema = Schema;
