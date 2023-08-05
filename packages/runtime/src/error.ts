/* eslint-disable @typescript-eslint/no-explicit-any */
export function isPrismaClientKnownRequestError(
    err: any
): err is { code: string; message: string; meta?: Record<string, unknown> } {
    return findConstructorName(err.__proto__, 'PrismaClientKnownRequestError');
}

export function isPrismaClientUnknownRequestError(err: any): err is { message: string } {
    return findConstructorName(err.__proto__, 'PrismaClientUnknownRequestError');
}

export function isPrismaClientValidationError(err: any): err is { message: string } {
    return findConstructorName(err.__proto__, 'PrismaClientValidationError');
}

function findConstructorName(proto: any, name: string): boolean {
    if (!proto) {
        return false;
    }
    return proto.constructor.name === name || findConstructorName(proto.__proto__, name);
}
