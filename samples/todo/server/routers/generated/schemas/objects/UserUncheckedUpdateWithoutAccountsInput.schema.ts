import { z } from 'zod';
import { StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { NullableDateTimeFieldUpdateOperationsInputObjectSchema } from './NullableDateTimeFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { SpaceUserUncheckedUpdateManyWithoutUserNestedInputObjectSchema } from './SpaceUserUncheckedUpdateManyWithoutUserNestedInput.schema';
import { ListUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema } from './ListUncheckedUpdateManyWithoutOwnerNestedInput.schema';
import { TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema } from './TodoUncheckedUpdateManyWithoutOwnerNestedInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedUpdateWithoutAccountsInput> = z
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
        lists: z.lazy(() => ListUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema).optional(),
        todos: z.lazy(() => TodoUncheckedUpdateManyWithoutOwnerNestedInputObjectSchema).optional(),
        zenstack_guard: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
        zenstack_transaction: z
            .union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)])
            .optional()
            .nullable(),
    })
    .strict();

export const UserUncheckedUpdateWithoutAccountsInputObjectSchema = Schema;
