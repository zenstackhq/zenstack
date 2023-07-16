/* eslint-disable @typescript-eslint/no-explicit-any */
import { AUXILIARY_FIELDS } from '@zenstackhq/runtime';
import { Decimal } from 'decimal.js';
import SuperJSON from 'superjson';
import { LoggerConfig } from '../types';

export function logError(logger: LoggerConfig | undefined | null, message: string, code?: string) {
    if (logger === undefined) {
        console.error(`@zenstackhq/server: error ${code ? '[' + code + ']' : ''}, ${message}`);
    } else if (logger?.error) {
        logger.error(message, code);
    }
}

export function logWarning(logger: LoggerConfig | undefined | null, message: string) {
    if (logger === undefined) {
        console.warn(`@zenstackhq/server: ${message}`);
    } else if (logger?.warn) {
        logger.warn(message);
    }
}

export function logInfo(logger: LoggerConfig | undefined | null, message: string) {
    if (logger === undefined) {
        console.log(`@zenstackhq/server: ${message}`);
    } else if (logger?.info) {
        logger.info(message);
    }
}

function stripAuxFields(data: unknown) {
    if (Array.isArray(data)) {
        return data.forEach(stripAuxFields);
    } else if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
            if (AUXILIARY_FIELDS.includes(key)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete (data as any)[key];
            } else {
                stripAuxFields(value);
            }
        }
    }
}

/**
 * Processes entity data returned from Prisma call.
 */
export function processEntityData(data: any) {
    if (data) {
        stripAuxFields(data);
    }
}

/**
 * Registers custom superjson serializers.
 */
export function registerCustomSerializers() {
    SuperJSON.registerCustom<Decimal, string>(
        {
            isApplicable: (v): v is Decimal => Decimal.isDecimal(v),
            serialize: (v) => v.toJSON(),
            deserialize: (v) => new Decimal(v),
        },
        'Decimal'
    );

    SuperJSON.registerCustom<Buffer, string>(
        {
            isApplicable: (v): v is Buffer => Buffer.isBuffer(v),
            serialize: (v) => v.toString('base64'),
            deserialize: (v) => Buffer.from(v, 'base64'),
        },
        'Bytes'
    );
}
