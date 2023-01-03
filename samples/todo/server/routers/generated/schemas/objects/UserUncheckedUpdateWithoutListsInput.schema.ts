import { z } from 'zod';
import { StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { NullableDateTimeFieldUpdateOperationsInputObjectSchema } from './NullableDateTimeFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { SpaceUserUncheckedUpdateManyWithoutUserNestedInputObjectSchema } from './SpaceUserUncheckedUpdateManyWithoutUserNestedInput.schema';
import { TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema } from './TodoUncheckedUpdateManyWithoutOwnerNestedInput.schema';
import { AccountUncheckedUpdateManyWithoutUserNestedInputObjectSchema } from './AccountUncheckedUpdateManyWithoutUserNestedInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedUpdateWithoutListsInput> = z
    .object({
        id: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
        createdAt: z.union([z.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
        updatedAt: z.union([z.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
        email: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
        emailVerified: z
            .union([z.date(), z.lazy(() => NullableDateTimeFieldUpdateOperationsInputObjectSchema)])
            .optional()
            .nullable(),
        password: z
            .union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)])
            .optional()
            .nullable(),
        name: z
            .union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)])
            .optional()
            .nullable(),
        spaces: z.lazy(() => SpaceUserUncheckedUpdateManyWithoutUserNestedInputObjectSchema).optional(),
        image: z
            .union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)])
            .optional()
            .nullable(),
        todos: z.lazy(() => TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema).optional(),
        accounts: z.lazy(() => AccountUncheckedUpdateManyWithoutUserNestedInputObjectSchema).optional(),
    })
    .strict();

export const UserUncheckedUpdateWithoutListsInputObjectSchema = Schema;
