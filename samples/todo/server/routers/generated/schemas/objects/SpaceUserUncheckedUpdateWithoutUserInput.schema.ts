import { z } from 'zod';
import { StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';
import { EnumSpaceUserRoleFieldUpdateOperationsInputObjectSchema } from './EnumSpaceUserRoleFieldUpdateOperationsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUncheckedUpdateWithoutUserInput> = z
    .object({
        id: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
        createdAt: z.union([z.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
        updatedAt: z.union([z.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
        spaceId: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
        role: z
            .union([
                z.lazy(() => SpaceUserRoleSchema),
                z.lazy(() => EnumSpaceUserRoleFieldUpdateOperationsInputObjectSchema),
            ])
            .optional(),
    })
    .strict();

export const SpaceUserUncheckedUpdateWithoutUserInputObjectSchema = Schema;
