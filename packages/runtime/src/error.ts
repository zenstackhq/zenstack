/* eslint-disable @typescript-eslint/no-explicit-any */
export function isPrismaClientKnownRequestError(
    err: any
): err is { code: string; message: string; meta?: Record<string, unknown> } {
    return err.__proto__.constructor.name === 'PrismaClientKnownRequestError';
}

export function isPrismaClientUnknownRequestError(err: any): err is { message: string } {
    return err.__proto__.constructor.name === 'PrismaClientUnknownRequestError';
}

export function isPrismaClientValidationError(err: any): err is { message: string } {
    return err.__proto__.constructor.name === 'PrismaClientValidationError';
}
