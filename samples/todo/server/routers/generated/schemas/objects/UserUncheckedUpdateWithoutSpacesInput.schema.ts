import { z } from 'zod';
import { StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { NullableDateTimeFieldUpdateOperationsInputObjectSchema } from './NullableDateTimeFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { ListUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema } from './ListUncheckedUpdateManyWithoutOwnerNestedInput.schema';
import { TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema } from './TodoUncheckedUpdateManyWithoutOwnerNestedInput.schema';
import { AccountUncheckedUpdateManyWithoutUserNestedInputObjectSchema } from './AccountUncheckedUpdateManyWithoutUserNestedInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedUpdateWithoutSpacesInput> = z
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
        image: z
            .union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)])
            .optional()
            .nullable(),
        lists: z.lazy(() => ListUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema).optional(),
        todos: z.lazy(() => TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema).optional(),
        accounts: z.lazy(() => AccountUncheckedUpdateManyWithoutUserNestedInputObjectSchema).optional(),
    })
    .strict();

export const UserUncheckedUpdateWithoutSpacesInputObjectSchema = Schema;
