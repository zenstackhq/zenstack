import { z } from 'zod';
import { AccountSelectObjectSchema } from './AccountSelect.schema';
import { AccountIncludeObjectSchema } from './AccountInclude.schema';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.AccountArgs> = z
  .object({
    select: z.lazy(() => AccountSelectObjectSchema).optional(),
    include: z.lazy(() => AccountIncludeObjectSchema).optional(),
  })
  .strict();

export const AccountArgsObjectSchema = Schema;
