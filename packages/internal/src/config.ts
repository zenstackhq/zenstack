/**
 * Logging levels
 */
export type LogLevel = 'verbose' | 'info' | 'query' | 'warn' | 'error';

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
