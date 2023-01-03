import { z } from 'zod';
import { StringFilterObjectSchema } from './StringFilter.schema';
import { DateTimeFilterObjectSchema } from './DateTimeFilter.schema';
import { SpaceUserListRelationFilterObjectSchema } from './SpaceUserListRelationFilter.schema';
import { ListListRelationFilterObjectSchema } from './ListListRelationFilter.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.SpaceWhereInput> = z
    .object({
        AND: z
            .union([z.lazy(() => SpaceWhereInputObjectSchema), z.lazy(() => SpaceWhereInputObjectSchema).array()])
            .optional(),
        OR: z
            .lazy(() => SpaceWhereInputObjectSchema)
            .array()
            .optional(),
        NOT: z
            .union([z.lazy(() => SpaceWhereInputObjectSchema), z.lazy(() => SpaceWhereInputObjectSchema).array()])
            .optional(),
        id: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        createdAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        updatedAt: z.union([z.lazy(() => DateTimeFilterObjectSchema), z.date()]).optional(),
        name: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        slug: z.union([z.lazy(() => StringFilterObjectSchema), z.string()]).optional(),
        members: z.lazy(() => SpaceUserListRelationFilterObjectSchema).optional(),
        lists: z.lazy(() => ListListRelationFilterObjectSchema).optional(),
    })
    .strict();

export const SpaceWhereInputObjectSchema = Schema;
