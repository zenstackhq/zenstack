import { ServerErrorCode } from '@zenstackhq/internal';

export * from '.zenstack/lib/hooks';
export type HooksError = {
    status: number;
    info: {
        code: ServerErrorCode;
        message: string;
    };
};
