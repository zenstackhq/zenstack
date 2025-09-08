/* eslint-disable @typescript-eslint/no-explicit-any */
import { fromZodError as fromZodErrorV3 } from 'zod-validation-error/v3';
import { fromZodError as fromZodErrorV4 } from 'zod-validation-error/v4';

/**
 * Formats a Zod error message for better readability. Compatible with both Zod v3 and v4.
 */
export function getZodErrorMessage(err: unknown): string {
    if (!(err instanceof Error)) {
        return 'Unknown error';
    }

    try {
        if ('_zod' in err) {
            return fromZodErrorV4(err as any).message;
        } else {
            return fromZodErrorV3(err as any).message;
        }
    } catch {
        return err.message;
    }
}
