import { z } from 'zod';
import { StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { SpaceUpdateOneRequiredWithoutMembersNestedInputObjectSchema } from './SpaceUpdateOneRequiredWithoutMembersNestedInput.schema';
import { UserUpdateOneRequiredWithoutSpacesNestedInputObjectSchema } from './UserUpdateOneRequiredWithoutSpacesNestedInput.schema';
import { SpaceUserRoleSchema } from '../enums/SpaceUserRole.schema';
import { EnumSpaceUserRoleFieldUpdateOperationsInputObjectSchema } from './EnumSpaceUserRoleFieldUpdateOperationsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceUserUpdateInput> = z
    .object({
        id: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
        createdAt: z.union([z.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
        updatedAt: z.union([z.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
        space: z.lazy(() => SpaceUpdateOneRequiredWithoutMembersNestedInputObjectSchema).optional(),
        user: z.lazy(() => UserUpdateOneRequiredWithoutSpacesNestedInputObjectSchema).optional(),
        role: z
            .union([
                z.lazy(() => SpaceUserRoleSchema),
                z.lazy(() => EnumSpaceUserRoleFieldUpdateOperationsInputObjectSchema),
            ])
            .optional(),
    })
    .strict();

export const SpaceUserUpdateInputObjectSchema = Schema;
