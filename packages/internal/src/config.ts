import { LogLevel } from './types';

/**
 * Logging config definition
 */
export type LogDefinition = {
    level: LogLevel;
    emit: 'stdout' | 'event';
};

/**
 * Service configuration
 */
export interface ServiceConfig {
    log?: Array<LogLevel | LogDefinition>;
}
