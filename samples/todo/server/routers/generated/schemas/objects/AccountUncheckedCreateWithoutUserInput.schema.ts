import { z } from 'zod';

import type { Prisma } from '@prisma/client';

const Schema: z.ZodType<Prisma.AccountUncheckedCreateWithoutUserInput> = z
    .object({
        id: z.string().optional(),
        type: z.string(),
        provider: z.string(),
        providerAccountId: z.string(),
        refresh_token: z.string().optional().nullable(),
        refresh_token_expires_in: z.number().optional().nullable(),
        access_token: z.string().optional().nullable(),
        expires_at: z.number().optional().nullable(),
        token_type: z.string().optional().nullable(),
        scope: z.string().optional().nullable(),
        id_token: z.string().optional().nullable(),
        session_state: z.string().optional().nullable(),
    })
    .strict();

export const AccountUncheckedCreateWithoutUserInputObjectSchema = Schema;
