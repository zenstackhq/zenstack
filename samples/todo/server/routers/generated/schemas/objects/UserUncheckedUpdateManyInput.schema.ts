import { z } from 'zod';
import { StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { NullableDateTimeFieldUpdateOperationsInputObjectSchema } from './NullableDateTimeFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.UserUncheckedUpdateManyInput> = z
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
    })
    .strict();

export const UserUncheckedUpdateManyInputObjectSchema = Schema;
